"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, Send, XCircle, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  approveJournalEntryAction,
  markJournalEntryReadyToPostAction,
  rejectJournalEntryAction,
  returnJournalEntryToEditAction,
  returnRejectedJournalToReviewAction,
  sendJournalEntryForReviewAction,
} from "@/actions/journal-entries";
import type { JournalEntryStatus } from "@prisma/client";

export function JournalEntryReviewActions({
  companyId,
  journalEntryId,
  status,
  version,
  totalDebit,
  totalCredit,
  difference,
  blockingErrors,
}: {
  companyId: string;
  journalEntryId: string;
  status: JournalEntryStatus;
  version: number;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  blockingErrors: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"SEND" | "APPROVE" | "REJECT" | "READY" | "EDIT" | "REVIEW" | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function close() {
    if (!isPending) {
      setDialog(null);
      setReason("");
    }
  }

  function confirm() {
    startTransition(async () => {
      const result =
        dialog === "SEND"
          ? await sendJournalEntryForReviewAction(companyId, journalEntryId)
          : dialog === "APPROVE"
            ? await approveJournalEntryAction(companyId, journalEntryId, version)
            : dialog === "REJECT"
              ? await rejectJournalEntryAction(companyId, journalEntryId, reason)
              : dialog === "READY"
                ? await markJournalEntryReadyToPostAction(companyId, journalEntryId, version)
                : dialog === "REVIEW"
                  ? await returnRejectedJournalToReviewAction(companyId, journalEntryId)
                  : await returnJournalEntryToEditAction(companyId, journalEntryId);

      if (result.ok) {
        toast(
          dialog === "APPROVE"
            ? "Journal approved. It remains unposted."
            : dialog === "READY"
              ? "Journal marked Ready to Post. It remains unposted."
              : dialog === "REJECT"
                ? "Journal rejected."
                : dialog === "REVIEW"
                  ? "Journal returned to review."
                  : dialog === "EDIT"
                    ? "Journal returned to edit; previous approval is invalid."
                    : dialog === "SEND"
                      ? "Journal sent for review."
                      : "Journal updated.",
          "success"
        );
        close();
        router.refresh();
      } else {
        toast(result.error, "error");
        router.refresh();
      }
    });
  }

  if (status === "DRAFT") {
    return (
      <>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog("SEND")} disabled={isPending}>
          <Send className="h-4 w-4" /> Send for Review
        </Button>
        <Dialog open={dialog === "SEND"} onOpenChange={(open) => !open && close()} title="Send Journal for Review?" description="The server will run the deterministic validation engine again before changing the review state." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Checking…" : "Send for Review"}</Button>
          </>
        } />
      </>
    );
  }

  if (status === "NEEDS_REVIEW" || status === "NOT_BALANCED" || status === "BALANCED") {
    const canApprove = status === "BALANCED" && blockingErrors.length === 0 && difference === "0.0000";
    return (
      <>
        {canApprove ? (
          <Button type="button" variant="primary" size="sm" onClick={() => setDialog("APPROVE")} disabled={isPending}>
            <CheckCircle2 className="h-4 w-4" /> Approve Journal
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("REJECT")} disabled={isPending}>
          <XCircle className="h-4 w-4" /> Reject
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDialog("EDIT")} disabled={isPending}>
          <PencilLine className="h-4 w-4" /> Return to Edit
        </Button>

        <Dialog open={dialog === "APPROVE"} onOpenChange={(open) => !open && close()} title="Approve Journal Entry?" description="Approval is a human review decision. It does not post the journal." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Validating…" : "Approve"}</Button>
          </>
        }>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-ink-500">Debit</p><p className="font-mono font-medium">{totalDebit}</p></div>
            <div><p className="text-xs text-ink-500">Credit</p><p className="font-mono font-medium">{totalCredit}</p></div>
            <div className="col-span-2 rounded-md border border-positive/20 bg-positive/5 px-3 py-2 text-ink-800">No blocking validation errors found. After approval, the journal remains unposted and can move to Ready to Post after pre-posting checks.</div>
          </div>
        </Dialog>

        <Dialog open={dialog === "REJECT"} onOpenChange={(open) => !open && close()} title="Reject Journal Entry?" description="A reason is required and will be recorded in the audit trail." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={isPending || !reason.trim()}>{isPending ? "Rejecting…" : "Reject"}</Button>
          </>
        }>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this journal being rejected?" rows={4} />
        </Dialog>

        <Dialog open={dialog === "EDIT"} onOpenChange={(open) => !open && close()} title="Return to Edit?" description="The journal will become editable again. Any approval state is removed and review will be required again." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Returning…" : "Return to Edit"}</Button>
          </>
        } />
      </>
    );
  }

  if (status === "APPROVED") {
    return (
      <>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog("READY")} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" /> Ready to Post
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("EDIT")} disabled={isPending}>
          <PencilLine className="h-4 w-4" /> Return to Edit
        </Button>
        <Dialog open={dialog === "READY"} onOpenChange={(open) => !open && close()} title="Mark Ready to Post?" description="Pre-posting checks will run on the server. This does not post the journal or change the General Ledger." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Checking…" : "Mark Ready to Post"}</Button>
          </>
        } />
        <Dialog open={dialog === "EDIT"} onOpenChange={(open) => !open && close()} title="Return Approved Journal to Edit?" description="This invalidates the approval and requires the journal to be reviewed again." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Returning…" : "Return to Edit"}</Button>
          </>
        } />
      </>
    );
  }

  if (status === "READY_TO_POST") {
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("EDIT")} disabled={isPending}>
          <PencilLine className="h-4 w-4" /> Return to Edit
        </Button>
        <Dialog open={dialog === "EDIT"} onOpenChange={(open) => !open && close()} title="Return Ready Journal to Edit?" description="This removes the Ready to Post state. No posting occurs." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Returning…" : "Return to Edit"}</Button>
          </>
        } />
      </>
    );
  }

  if (status === "REJECTED") {
    return (
      <>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog("REVIEW")} disabled={isPending}>
          <RotateCcw className="h-4 w-4" /> Return to Review
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("EDIT")} disabled={isPending}>
          <PencilLine className="h-4 w-4" /> Return to Edit
        </Button>
        <Dialog open={dialog === "REVIEW"} onOpenChange={(open) => !open && close()} title="Return Rejected Journal to Review?" description="The journal will require review again." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Returning…" : "Return to Review"}</Button>
          </>
        } />
        <Dialog open={dialog === "EDIT"} onOpenChange={(open) => !open && close()} title="Return Rejected Journal to Edit?" description="The journal will become editable and any rejection state will be cleared." footer={
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Returning…" : "Return to Edit"}</Button>
          </>
        } />
      </>
    );
  }

  return null;
}
