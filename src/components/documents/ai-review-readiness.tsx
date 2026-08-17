"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { prepareAIReviewAction } from "@/actions/ai-review";

type Status = "NOT_REVIEWED" | "READY" | "REVIEWING" | "REVIEWED" | "NEEDS_HUMAN_REVIEW" | "FAILED";

function statusVariant(status: Status) {
  if (status === "READY") return "success" as const;
  if (status === "NEEDS_HUMAN_REVIEW") return "warning" as const;
  if (status === "FAILED") return "danger" as const;
  return "default" as const;
}

function statusLabel(status: Status) {
  return status.replaceAll("_", " ");
}

export function AIReviewReadiness({
  companyId,
  documentId,
  candidateId,
  status,
  confidence,
  warningCount,
  contextVersion,
}: {
  companyId: string;
  documentId: string;
  candidateId: string;
  status: Status;
  confidence: string;
  warningCount: number;
  contextVersion: string;
}) {
  const [currentStatus, setCurrentStatus] = useState<Status>(status);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function prepare() {
    startTransition(async () => {
      const result = await prepareAIReviewAction(companyId, documentId, candidateId);
      if (result.ok) { setCurrentStatus(result.status); toast(result.status === "READY" ? "AI review context is ready." : "Candidate needs human review before AI processing.", result.status === "READY" ? "success" : "error"); }
      else toast(result.error, "error");
    });
  }

  return (
    <div className="min-w-44 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(currentStatus)}>{statusLabel(currentStatus)}</Badge>
      </div>
      <div className="text-[10px] text-ink-500">Confidence: {confidence} · Warnings: {warningCount}</div>
      <div className="text-[10px] text-ink-400">Context {contextVersion}</div>
      {currentStatus === "NOT_REVIEWED" || currentStatus === "FAILED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={prepare}>
          <Sparkles className={`h-3.5 w-3.5 ${pending ? "animate-pulse" : ""}`} />
          {pending ? "Preparing…" : "Prepare AI Review"}
        </Button>
      ) : null}
    </div>
  );
}
