"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileUp, UploadCloud, Sparkles, XCircle, AlertTriangle } from "lucide-react";
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_SIZE,
  formatDocumentSize,
  getDocumentFileType,
} from "@/documents/config";
import { Button } from "@/components/ui/button";
import { smartImportFromBlobAction, smartImportFromDocumentIdAction } from "@/actions/smart-import";
import { correctDocumentClassificationAction } from "@/actions/documents";
import type { SmartImportOutcome } from "@/documents/smart-import";
import type { AccountingDocumentType } from "@prisma/client";

type Stage = "idle" | "uploading" | "processing" | "done";

const DOC_TYPE_OPTIONS: { value: AccountingDocumentType; label: string }[] = [
  { value: "BANK_STATEMENT", label: "Bank statement" },
  { value: "INVOICE", label: "Invoice" },
  { value: "BILL", label: "Bill" },
  { value: "RECEIPT", label: "Receipt" },
  { value: "BALANCE_SHEET", label: "Balance sheet" },
  { value: "INCOME_STATEMENT", label: "Income statement" },
  { value: "TRIAL_BALANCE", label: "Trial balance" },
  { value: "GENERAL_LEDGER", label: "General ledger" },
  { value: "TAX_DOCUMENT", label: "Tax document" },
  { value: "PAYROLL_DOCUMENT", label: "Payroll document" },
  { value: "EXPENSE_REPORT", label: "Expense report" },
  { value: "OTHER", label: "Other" },
];

export function SmartImportPanel({
  companyId,
  storageProvider,
  aiConfigured,
}: {
  companyId: string;
  storageProvider: "local" | "vercel-blob";
  /** True only when both DOCUMENT_AI_PROVIDER and ACCOUNTING_AI_PROVIDER are
   *  "openai". When false, extraction/account-suggestion silently fall back
   *  to basic pattern-matching heuristics — accurate-looking but often wrong
   *  for real statements, so the user needs to know before they trust it. */
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [guidance, setGuidance] = useState("");
  const [proposeAccounts, setProposeAccounts] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [emptyResult, setEmptyResult] = useState<SmartImportOutcome | null>(null);
  const [classifyDocId, setClassifyDocId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AccountingDocumentType>("BANK_STATEMENT");
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  function validate(candidate: File) {
    const type = getDocumentFileType(candidate.name);
    if (!type) return "Unsupported file type.";
    if (candidate.size <= 0) return "File is empty or invalid.";
    if (candidate.size > MAX_DOCUMENT_SIZE) return `File is too large. Maximum size is ${formatDocumentSize(MAX_DOCUMENT_SIZE)}.`;
    return null;
  }

  function pick(files: FileList | File[]) {
    setError(null);
    setEmptyResult(null);
    const picked = Array.from(files)[0];
    if (!picked) return;
    const invalid = validate(picked);
    if (invalid) { setError(invalid); return; }
    setFile(picked);
  }

  async function runViaBlob(candidate: File) {
    const extension = candidate.name.toLowerCase().split(".").pop();
    if (!extension) throw new Error("File extension is required.");
    const pathname = `documents/${companyId}/${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, candidate, {
      access: "private",
      handleUploadUrl: `/api/companies/${encodeURIComponent(companyId)}/documents/blob-upload`,
      clientPayload: JSON.stringify({ companyId, originalFileName: candidate.name, mimeType: candidate.type || "application/octet-stream" }),
      multipart: true,
      onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
    });
    setStage("processing");
    return smartImportFromBlobAction(companyId, blob.pathname, candidate.name, candidate.type || "application/octet-stream", guidance || undefined, proposeAccounts);
  }

  async function runViaLocal(candidate: File) {
    const form = new FormData();
    form.append("file", candidate);
    const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/documents`, { method: "POST", body: form });
    const data = (await response.json()) as { ok?: boolean; error?: string; document?: { id: string } };
    if (!response.ok || !data.ok || !data.document) throw new Error(data.error || "Upload failed. Please try again.");
    setProgress(100);
    setStage("processing");
    return smartImportFromDocumentIdAction(companyId, data.document.id, guidance || undefined, proposeAccounts);
  }

  async function run() {
    if (!file) return;
    setError(null);
    setEmptyResult(null);
    setProgress(0);
    setStage("uploading");
    try {
      const outcome = storageProvider === "vercel-blob" ? await runViaBlob(file) : await runViaLocal(file);
      await handleOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Smart Import failed. Please try again.");
      setStage("done");
    }
  }

  async function handleOutcome(outcome: SmartImportOutcome) {
    if (!outcome.ok) {
      if (outcome.needsClassification && outcome.documentId) {
        // Don't just tell the user to go classify it elsewhere — let them
        // do it right here and resume Smart Import automatically.
        setClassifyDocId(outcome.documentId);
        setClassifyError(null);
        setStage("done");
        return;
      }
      setError(outcome.error);
      setStage("done");
      return;
    }
    if (!outcome.candidateCount) {
      setEmptyResult(outcome);
      setStage("done");
      return;
    }
    // Nothing is created yet — hand off to the Reconcile screen where the
    // human reviews every proposed account and explicitly confirms.
    router.push(`/companies/${companyId}/journal-entries/new/review/${outcome.documentId}`);
  }

  async function confirmClassification() {
    if (!classifyDocId) return;
    setClassifying(true);
    setClassifyError(null);
    try {
      const corrected = await correctDocumentClassificationAction(companyId, classifyDocId, selectedType);
      if (!corrected.ok) {
        setClassifyError(corrected.error);
        return;
      }
      const docId = classifyDocId;
      setClassifyDocId(null);
      setStage("processing");
      const outcome = await smartImportFromDocumentIdAction(companyId, docId, guidance || undefined, proposeAccounts);
      await handleOutcome(outcome);
    } catch (e) {
      setClassifyError(e instanceof Error ? e.message : "Could not save the document type. Please try again.");
    } finally {
      setClassifying(false);
    }
  }

  function reset() {
    setFile(null);
    setGuidance("");
    setStage("idle");
    setProgress(0);
    setError(null);
    setEmptyResult(null);
    setClassifyDocId(null);
    setClassifyError(null);
    if (input.current) input.current.value = "";
  }

  const busy = stage === "uploading" || stage === "processing";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-ledger-600" />
        <div>
          <h2 className="font-display text-sm font-semibold text-ink-900">Smart Import</h2>
          <p className="mt-1 text-xs text-ink-500">
            Upload a bank statement, invoice, bill, or receipt. We&apos;ll read it and, on the next screen, you can review
            and confirm every proposed journal entry before anything is created — nothing posts until you do.
          </p>
        </div>
      </div>

      {!aiConfigured ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            AI document reading isn&apos;t fully configured (DOCUMENT_AI_PROVIDER / ACCOUNTING_AI_PROVIDER must both be
            <code className="mx-1 rounded bg-amber-100 px-1">openai</code>
            in your deployment environment). Falling back to basic pattern-matching — results on real statements may
            be inaccurate or incomplete. Review everything carefully on the next screen before confirming.
          </span>
        </div>
      ) : null}

      {!file ? (
        <div
          className="rounded-lg border-2 border-dashed border-ink-200 bg-surface-subtle p-6 text-center transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
        >
          <UploadCloud className="mx-auto h-8 w-8 text-ink-400" />
          <p className="mt-2 text-sm font-medium text-ink-800">Drag & drop a statement or document</p>
          <p className="mt-1 text-xs text-ink-500">or choose a file from your computer</p>
          <div className="mt-3 flex justify-center">
            <Button type="button" onClick={() => input.current?.click()}>
              <FileUp className="h-4 w-4" />Browse Files
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-500">PDF, XLS, XLSX, CSV, DOC, DOCX, JPG, JPEG, PNG, WEBP, TIFF · Max {formatDocumentSize(MAX_DOCUMENT_SIZE)}</p>
          <input ref={input} type="file" accept={DOCUMENT_ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) pick(e.target.files); }} />
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
              <p className="text-xs text-ink-500">{formatDocumentSize(file.size)}</p>
            </div>
            {!busy && stage !== "done" ? (
              <Button variant="ghost" size="sm" type="button" onClick={reset}>Remove</Button>
            ) : null}
          </div>

          {stage === "idle" ? (
            <div className="space-y-3">
              <label className="flex items-start gap-2 rounded-md border border-ink-100 bg-surface-subtle p-3 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={proposeAccounts}
                  onChange={(e) => setProposeAccounts(e.target.checked)}
                />
                <span>
                  <span className="block font-medium text-ink-800">Propose accounts &amp; journal types</span>
                  <span className="mt-0.5 block text-ink-500">
                    After staging, AI suggests debit/credit accounts per row. You confirm everything on the next
                    (Reconcile) screen — nothing posts until you do.
                  </span>
                </span>
              </label>

              <div>
                <label className="text-xs font-medium text-ink-700">Operator note (optional)</label>
                <textarea
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder='e.g. "Ignore the running balance column" or "This is our HSBC checking account statement — the far right column is the running balance, ignore it."'
                  rows={3}
                  className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-ink-500">Works fine without a note too — this just helps with ambiguous documents.</p>
              </div>
            </div>
          ) : null}

          {busy ? (
            <div>
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>{stage === "uploading" ? "Uploading…" : "AI is reading the document and staging transactions…"}</span>
                {stage === "uploading" ? <span>{progress}%</span> : null}
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full bg-ledger-500 ${stage === "processing" ? "w-full animate-pulse" : "transition-[width]"}`}
                  style={stage === "uploading" ? { width: `${progress}%` } : undefined}
                />
              </div>
            </div>
          ) : null}

          {stage === "idle" ? (
            <div className="flex justify-end">
              <Button variant="primary" type="button" onClick={() => void run()}>
                <Sparkles className="h-4 w-4" />Run Smart Import
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700" role="alert">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          <span>{error}</span>
        </div>
      ) : null}

      {emptyResult?.ok && !emptyResult.candidateCount ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-ink-100 bg-surface-subtle p-4 text-sm text-ink-600">
            <p>No transactions were found in this document.</p>
            {emptyResult.diagnostics?.aiReasoning ? (
              <p className="text-xs text-ink-500"><span className="font-medium text-ink-700">AI reasoning: </span>{emptyResult.diagnostics.aiReasoning}</p>
            ) : null}
            {emptyResult.diagnostics?.aiUnderstandingError ? (
              <p className="text-xs text-negative">AI document understanding error: {emptyResult.diagnostics.aiUnderstandingError}</p>
            ) : null}
            {emptyResult.diagnostics?.extractionWarnings.length ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-500">
                {emptyResult.diagnostics.extractionWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
            {emptyResult.diagnostics?.aiFindings.length ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-500">
                {emptyResult.diagnostics.aiFindings.map((f, i) => <li key={i}>{f.message}</li>)}
              </ul>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" type="button" onClick={reset}>Import another file</Button>
          </div>
        </div>
      ) : null}

      {classifyDocId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-ink-100 bg-white p-5 shadow-lg">
            <h3 className="font-display text-sm font-semibold text-ink-900">What kind of document is this?</h3>
            <p className="mt-1 text-xs text-ink-500">
              We couldn&apos;t tell from the file name alone. Pick the type below to continue — Smart Import will
              pick back up automatically.
            </p>

            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
              {DOC_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md border border-ink-100 px-3 py-2 text-sm hover:bg-surface-subtle"
                >
                  <input
                    type="radio"
                    name="doc-type"
                    value={opt.value}
                    checked={selectedType === opt.value}
                    onChange={() => setSelectedType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {classifyError ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-xs text-ink-700" role="alert">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" />
                <span>{classifyError}</span>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" type="button" disabled={classifying} onClick={() => { setClassifyDocId(null); reset(); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="button" disabled={classifying} onClick={() => void confirmClassification()}>
                {classifying ? "Saving…" : "Confirm & continue"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
