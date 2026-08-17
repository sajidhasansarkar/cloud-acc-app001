"use client";
import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { normalizeDocumentAction } from "@/actions/documents";
export function DocumentNormalizeAction({ companyId, documentId }: { companyId: string; documentId: string }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  return <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await normalizeDocumentAction(companyId, documentId); if (result.ok) toast(`Normalized ${result.candidateCount} transaction candidates.`, "success"); else toast(result.error, "error"); })}><Sparkles className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`}/>{pending ? "Normalizing…" : "Normalize data"}</Button>;
}
