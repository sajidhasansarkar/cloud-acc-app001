"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateNormalizedCandidateAction } from "@/actions/documents";
import { AIReviewPanel } from "@/components/documents/ai-review-panel";

type Candidate = {
  id: string;
  sourceRowReference: string;
  sourceSheetName: string | null;
  sourcePageNumber: number | null;
  sourceRowNumber: number | null;
  date: string | null;
  dateConfidence: string;
  description: string | null;
  descriptionConfidence: string;
  reference: string | null;
  referenceConfidence: string;
  debit: string | null;
  credit: string | null;
  amount: string | null;
  balance: string | null;
  currency: string | null;
  currencyConfidence: string;
  transactionType: string | null;
  confidence: string;
  warnings: string[];
  possibleDuplicate: boolean;
  manuallyCorrected: boolean;
  aiReviewStatus: "NOT_REVIEWED" | "READY" | "REVIEWING" | "REVIEWED" | "NEEDS_HUMAN_REVIEW" | "FAILED";
  aiReviewContextVersion: string;
};

function confidenceClass(value: string) {
  if (value === "HIGH") return "bg-positive/10 text-positive";
  if (value === "MEDIUM") return "bg-pending/10 text-pending";
  return "bg-ink-100 text-ink-600";
}

export function NormalizedCandidates({
  companyId,
  documentId,
  candidates,
}: {
  companyId: string;
  documentId: string;
  candidates: Candidate[];
}) {
  const [rows, setRows] = useState(candidates);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  if (!rows.length) {
    return (
      <section className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
        <h2 className="font-display text-sm font-semibold text-ink-900">Transaction candidates</h2>
        <p className="mt-2 text-sm text-ink-500">No transaction-like rows were detected yet.</p>
      </section>
    );
  }

  function updateRow(id: string, field: keyof Candidate, value: string | null) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function save(row: Candidate) {
    setPendingId(row.id);
    startTransition(async () => {
      const result = await updateNormalizedCandidateAction(companyId, documentId, row.id, {
        date: row.date ? row.date.slice(0, 10) : null,
        description: row.description,
        reference: row.reference,
        debit: row.debit,
        credit: row.credit,
        amount: row.amount,
        currency: row.currency,
      });
      setPendingId(null);
      if (result.ok) {
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, manuallyCorrected: true } : item)));
        toast("Normalized row updated.", "success");
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white shadow-card">
      <div className="border-b border-ink-100 p-4">
        <h2 className="font-display text-sm font-semibold text-ink-900">Transaction candidates</h2>
        <p className="mt-1 text-xs text-ink-500">
          Review detected fields before any future accounting workflow. Confidence is detection confidence, not accounting approval.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-xs">
          <thead className="border-b border-ink-100 bg-surface-muted">
            <tr>
              {["Source", "Date", "Description", "Reference", "Debit", "Credit", "Amount", "Balance", "Currency", "Confidence", "Warnings", "AI Review", "Action"].map((header) => (
                <th key={header} className="px-3 py-2 text-left font-medium text-ink-600">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-3 py-3 text-ink-600">
                  <div>{row.sourceSheetName ? `Sheet: ${row.sourceSheetName}` : row.sourcePageNumber ? `Page: ${row.sourcePageNumber}` : "Source"}</div>
                  <div>{row.sourceRowNumber ? `Row: ${row.sourceRowNumber}` : row.sourceRowReference}</div>
                </td>
                <td className="px-3 py-3">
                  <Input className="w-32" type="date" value={row.date ? row.date.slice(0, 10) : ""} onChange={(event) => updateRow(row.id, "date", event.target.value ? `${event.target.value}T00:00:00.000Z` : null)} />
                  <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] ${confidenceClass(row.dateConfidence)}`}>{row.dateConfidence}</span>
                </td>
                <td className="px-3 py-3"><Input className="w-52" value={row.description ?? ""} onChange={(event) => updateRow(row.id, "description", event.target.value)} /></td>
                <td className="px-3 py-3"><Input className="w-40" value={row.reference ?? ""} onChange={(event) => updateRow(row.id, "reference", event.target.value)} /></td>
                {(["debit", "credit", "amount", "balance"] as const).map((field) => (
                  <td key={field} className="px-3 py-3"><Input className="w-32" inputMode="decimal" value={row[field] ?? ""} onChange={(event) => updateRow(row.id, field, event.target.value)} /></td>
                ))}
                <td className="px-3 py-3"><Input className="w-20 uppercase" maxLength={3} value={row.currency ?? ""} onChange={(event) => updateRow(row.id, "currency", event.target.value.toUpperCase())} /></td>
                <td className="px-3 py-3">
                  <Badge className={confidenceClass(row.confidence)}>{row.confidence}</Badge>
                  {row.possibleDuplicate ? <div className="mt-1 text-pending">Possible duplicate</div> : null}
                  {row.manuallyCorrected ? <div className="mt-1 text-positive">Corrected</div> : null}
                </td>
                <td className="max-w-xs px-3 py-3 text-ink-600">
                  {row.warnings.length ? (
                    <div className="space-y-1">
                      {row.warnings.map((warning, index) => (
                        <div key={`${row.id}-warning-${index}`} className="flex gap-1">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-pending" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  ) : "—"}
                </td>
                <td className="px-3 py-3">
                  <AIReviewPanel companyId={companyId} documentId={documentId} candidateId={row.id} status={row.aiReviewStatus} source={{ date: row.date, description: row.description, reference: row.reference, debit: row.debit, credit: row.credit, amount: row.amount, currency: row.currency, sourceLabel: row.sourceSheetName ? `Sheet: ${row.sourceSheetName} · Row: ${row.sourceRowNumber ?? row.sourceRowReference}` : row.sourcePageNumber ? `Page: ${row.sourcePageNumber} · ${row.sourceRowReference}` : row.sourceRowReference }} />
                </td>
                <td className="px-3 py-3">
                  <Button size="sm" variant="outline" disabled={pendingId === row.id} onClick={() => save(row)}>
                    <Save className="h-3.5 w-3.5" />
                    {pendingId === row.id ? "Saving…" : "Save"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
