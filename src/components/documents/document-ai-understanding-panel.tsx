"use client";

import { useTransition } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { runDocumentAIExtractionAction } from "@/actions/documents";

type ProcessingResult = {
  extractionStatus: string;
  aiUnderstandingProvider: string | null;
  aiUnderstandingModel: string | null;
  aiUnderstandingReference: string | null;
  aiUnderstandingError: string | null;
  aiUnderstandingProcessedAt: Date | null;
} | null;

export function DocumentAIUnderstandingPanel({ companyId, documentId, processingResult, candidateCount, canManage }: { companyId: string; documentId: string; processingResult: ProcessingResult; candidateCount: number; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function run() {
    startTransition(async () => {
      const result = await runDocumentAIExtractionAction(companyId, documentId);
      if (!result.ok) toast(result.error, "error");
      else toast(`AI processing complete — ${result.candidateCount} transaction(s) found.`, "success");
    });
  }

  const extracted = processingResult && ["COMPLETED", "PARTIAL"].includes(processingResult.extractionStatus);
  const status = !processingResult?.aiUnderstandingProcessedAt
    ? "NOT_RUN"
    : processingResult.aiUnderstandingError
    ? "FAILED"
    : "COMPLETED";

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-ink-900 inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />OpenAI document understanding</h2>
          <p className="mt-1 text-xs text-ink-500">Classifies the document and extracts accounting transactions from the extracted/OCR&apos;d content. Requires <code>OPENAI_API_KEY</code> and <code>DOCUMENT_AI_PROVIDER=openai</code> to be configured.</p>
        </div>
        {canManage && extracted && (
          <Button variant="outline" size="sm" onClick={run} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5" />{pending ? "Processing…" : status === "NOT_RUN" ? "Run AI extraction" : "Re-run AI extraction"}
          </Button>
        )}
      </div>

      {!extracted && <p className="mt-3 text-sm text-ink-500">Run content extraction first.</p>}

      {extracted && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-ink-500">Status</p>
            <div className="mt-1"><Badge variant={status === "COMPLETED" ? "success" : status === "FAILED" ? "danger" : "default"}>{status === "NOT_RUN" ? "Not run yet" : status === "FAILED" ? "Failed" : "Completed"}</Badge></div>
          </div>
          <div><p className="text-xs text-ink-500">Provider / Model</p><p className="mt-1 text-sm text-ink-800">{processingResult?.aiUnderstandingProvider ? `${processingResult.aiUnderstandingProvider} · ${processingResult.aiUnderstandingModel}` : "—"}</p></div>
          <div><p className="text-xs text-ink-500">Transactions found</p><p className="mt-1 text-sm text-ink-800">{candidateCount}</p></div>
        </div>
      )}

      {processingResult?.aiUnderstandingError && (
        <p className="mt-4 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700">{processingResult.aiUnderstandingError}</p>
      )}
    </div>
  );
}
