"use client";

import { useState, useTransition } from "react";
import { RefreshCw, WandSparkles } from "lucide-react";
import type { AccountingDocumentType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { classifyDocumentAction, correctDocumentClassificationAction } from "@/actions/documents";
import { ACCOUNTING_DOCUMENT_TYPE_LABELS, CLASSIFIABLE_MANUAL_TYPES, PROCESSING_ROUTE_LABELS } from "@/documents/classification-config";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CLASSIFYING: "Classifying",
  CLASSIFIED: "Classified",
  CLASSIFICATION_FAILED: "Classification failed",
  NEEDS_REVIEW: "Needs review",
  MANUALLY_REVIEWED: "Manually reviewed",
};

export function DocumentClassificationPanel({
  companyId,
  documentId,
  classification,
  canManage,
}: {
  companyId: string;
  documentId: string;
  classification: {
    status: string;
    documentType: AccountingDocumentType;
    confidence: string;
    reasoning: string | null;
    processingRoute: string;
    manuallyReviewed: boolean;
    classifiedAt: Date | null;
  } | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedType, setSelectedType] = useState<AccountingDocumentType>(classification?.documentType === "UNKNOWN" ? "OTHER" : (classification?.documentType ?? "OTHER"));
  const { toast } = useToast();
  const needsReview = !classification || classification.status === "CLASSIFICATION_FAILED" || classification.status === "NEEDS_REVIEW" || classification.documentType === "UNKNOWN" || classification.confidence === "LOW";

  function classify(force: boolean) {
    startTransition(async () => {
      const result = await classifyDocumentAction(companyId, documentId, force);
      if (!result.ok) toast(result.error, "error");
      else toast(result.skipped ? "Document was already classified." : "Document classification completed.", "success");
    });
  }

  function correct() {
    startTransition(async () => {
      const result = await correctDocumentClassificationAction(companyId, documentId, selectedType);
      if (!result.ok) toast(result.error, "error");
      else toast("Document classification corrected.", "success");
    });
  }

  return <div className="rounded-lg border border-ink-100 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink-900">Document classification</h2>
        <p className="mt-1 text-xs text-ink-500">Phase 5A-2 uses document metadata only. No file content, OCR, or AI analysis is performed.</p>
      </div>
      {canManage && <Button type="button" variant="outline" size="sm" onClick={() => classify(true)} disabled={pending}><RefreshCw className="h-3.5 w-3.5" />{pending ? "Classifying…" : "Reclassify"}</Button>}
    </div>

    {!classification ? <div className="mt-4 rounded-md border border-ink-100 bg-surface-subtle p-4"><p className="text-sm font-medium text-ink-800">Document classification pending.</p>{canManage && <div className="mt-3"><Button type="button" size="sm" onClick={() => classify(false)} disabled={pending}><WandSparkles className="h-3.5 w-3.5" />Classify document</Button></div>}</div> : <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-ink-500">Classification status</p><p className="mt-1 text-sm font-medium text-ink-800">{STATUS_LABELS[classification.status] ?? classification.status}</p></div>
        <div><p className="text-xs text-ink-500">Document Type</p><p className="mt-1 text-sm font-medium text-ink-800">{ACCOUNTING_DOCUMENT_TYPE_LABELS[classification.documentType]}</p></div>
        <div><p className="text-xs text-ink-500">Confidence</p><p className="mt-1 text-sm font-medium text-ink-800">{classification.confidence}</p></div>
        <div><p className="text-xs text-ink-500">Processing Route</p><p className="mt-1 text-sm font-medium text-ink-800">{PROCESSING_ROUTE_LABELS[classification.processingRoute as keyof typeof PROCESSING_ROUTE_LABELS] ?? classification.processingRoute}</p></div>
      </div>
      {classification.status === "CLASSIFICATION_FAILED" && <p className="mt-4 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700">Document classification failed.</p>}
      {needsReview && classification.status !== "CLASSIFICATION_FAILED" && <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-ink-700">Manual review required.</p>}
      {classification.reasoning && <div className="mt-4 rounded-md border border-ink-100 bg-surface-subtle p-3"><p className="text-xs font-medium text-ink-600">Classification reasoning</p><p className="mt-1 text-sm text-ink-700">{classification.reasoning}</p></div>}
      {canManage && needsReview && <div className="mt-4 rounded-md border border-ink-100 p-4"><p className="text-sm font-medium text-ink-800">Correct classification</p><p className="mt-1 text-xs text-ink-500">Choose the correct document type. This correction only changes classification and routing; it does not create accounting entries.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={selectedType} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedType(event.target.value as AccountingDocumentType)} className="sm:max-w-xs"><option value="OTHER">Other</option>{CLASSIFIABLE_MANUAL_TYPES.filter((type) => type !== "OTHER").map((type) => <option key={type} value={type}>{ACCOUNTING_DOCUMENT_TYPE_LABELS[type]}</option>)}</Select><Button type="button" onClick={correct} disabled={pending}>{pending ? "Saving…" : "Save correction"}</Button></div></div>}
    </>}
  </div>;
}
