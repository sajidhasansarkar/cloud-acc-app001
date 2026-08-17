"use client";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { retryDocumentProcessingAction } from "@/actions/documents";

export function DocumentRetryAction({ companyId, documentId }: { companyId: string; documentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryDocumentProcessingAction(companyId, documentId);
      if (result.ok) toast("Document processed successfully.", "success");
      else { setError(result.error); toast(result.error, "error"); }
    });
  }
  return <div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" size="icon" onClick={retry} disabled={pending} aria-label="Retry processing" title={pending ? "Processing…" : "Retry processing"}><RotateCcw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /></Button>{error ? <span className="sr-only" role="alert">{error}</span> : null}</div>;
}
