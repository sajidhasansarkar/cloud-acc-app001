"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { FileUp, UploadCloud, Sparkles, XCircle, CheckCircle2, AlertTriangle, ArrowUpRight } from "lucide-react";
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_SIZE,
  formatDocumentSize,
  getDocumentFileType,
} from "@/documents/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { smartImportFromBlobAction, smartImportFromDocumentIdAction } from "@/actions/smart-import";
import type { SmartImportOutcome } from "@/documents/smart-import";

type Stage = "idle" | "uploading" | "processing" | "done";

export function SmartImportPanel({
  companyId,
  storageProvider,
}: {
  companyId: string;
  storageProvider: "local" | "vercel-blob";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [guidance, setGuidance] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartImportOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const { toast } = useToast();

  function validate(candidate: File) {
    const type = getDocumentFileType(candidate.name);
    if (!type) return "Unsupported file type.";
    if (candidate.size <= 0) return "File is empty or invalid.";
    if (candidate.size > MAX_DOCUMENT_SIZE) return `File is too large. Maximum size is ${formatDocumentSize(MAX_DOCUMENT_SIZE)}.`;
    return null;
  }

  function pick(files: FileList | File[]) {
    setError(null);
    setResult(null);
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
    return smartImportFromBlobAction(companyId, blob.pathname, candidate.name, candidate.type || "application/octet-stream", guidance || undefined);
  }

  async function runViaLocal(candidate: File) {
    const form = new FormData();
    form.append("file", candidate);
    const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/documents`, { method: "POST", body: form });
    const data = (await response.json()) as { ok?: boolean; error?: string; document?: { id: string } };
    if (!response.ok || !data.ok || !data.document) throw new Error(data.error || "Upload failed. Please try again.");
    setProgress(100);
    setStage("processing");
    return smartImportFromDocumentIdAction(companyId, data.document.id, guidance || undefined);
  }

  async function run() {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);
    setStage("uploading");
    try {
      const outcome = storageProvider === "vercel-blob" ? await runViaBlob(file) : await runViaLocal(file);
      setResult(outcome);
      if (!outcome.ok) {
        setError(outcome.error);
      } else if (outcome.created.length) {
        toast(`${outcome.created.length} journal entr${outcome.created.length === 1 ? "y" : "ies"} created from ${outcome.documentName}.`, "success");
      } else if (outcome.candidateCount === 0) {
        toast("No transactions were found in this document.", "error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Smart Import failed. Please try again.");
    } finally {
      setStage("done");
    }
  }

  function reset() {
    setFile(null);
    setGuidance("");
    setStage("idle");
    setProgress(0);
    setError(null);
    setResult(null);
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
            Upload a bank statement, invoice, bill, or receipt — AI reads it and creates a draft journal entry for
            each transaction. You can edit, add, or delete lines afterwards like any other journal entry.
          </p>
        </div>
      </div>

      {!file ? (
        <div
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-ledger-500 bg-ledger-500/5" : "border-ink-200 bg-surface-subtle"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
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
            <div>
              <label className="text-xs font-medium text-ink-700">Guide the AI (optional)</label>
              <textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder='e.g. "This is our HSBC checking account statement — the far right column is the running balance, ignore it."'
                rows={3}
                className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-ink-500">Works fine without guidance too — this just helps with ambiguous documents.</p>
            </div>
          ) : null}

          {busy ? (
            <div>
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>{stage === "uploading" ? "Uploading…" : "AI is reading the document and building journal entries…"}</span>
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

      {result?.ok && stage === "done" ? (
        <div className="space-y-3">
          {result.created.length ? (
            <div className="rounded-lg border border-ink-100 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <CheckCircle2 className="h-4 w-4 text-positive" />
                {result.created.length} draft journal entr{result.created.length === 1 ? "y" : "ies"} created
              </div>
              <ul className="mt-3 divide-y divide-ink-100">
                {result.created.map((entry) => (
                  <li key={entry.journalEntryId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-800">{entry.description || entry.entryNumber}</p>
                      <p className="text-xs text-ink-500">{entry.entryNumber} · {new Date(entry.entryDate).toISOString().slice(0, 10)} · {entry.amount}</p>
                    </div>
                    <Link
                      href={`/companies/${companyId}/journal-entries/${entry.journalEntryId}/edit`}
                      className="inline-flex shrink-0 items-center gap-1 text-ledger-600 underline"
                    >
                      Edit <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.needsAttention.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {result.needsAttention.length} transaction{result.needsAttention.length === 1 ? "" : "s"} need attention
              </div>
              <ul className="mt-3 space-y-2">
                {result.needsAttention.map((item) => (
                  <li key={item.candidateId} className="text-sm">
                    <p className="font-medium text-ink-800">{item.description || "Untitled transaction"}{item.amount ? ` · ${item.amount}` : ""}</p>
                    <p className="text-xs text-ink-600">{item.reason}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">
                These weren&apos;t created automatically to avoid guessing. You can create them manually on this page instead.
              </p>
            </div>
          ) : null}

          {!result.candidateCount ? (
            <div className="rounded-lg border border-ink-100 bg-surface-subtle p-4 text-sm text-ink-600">
              No transactions were found in this document.
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" type="button" onClick={reset}>Import another file</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
