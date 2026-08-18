"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  markJournalEntryReadyForPostingAction,
  returnJournalEntryToDraftAction,
  sendJournalEntryForReviewAction,
} from "@/actions/journal-entries";
import type { JournalEntryStatus } from "@prisma/client";

export function JournalEntryReviewActions({
  companyId,
  journalEntryId,
  status,
}: {
  companyId: string;
  journalEntryId: string;
  status: JournalEntryStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"SEND" | "READY" | "DRAFT" | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = dialog === "SEND"
        ? await sendJournalEntryForReviewAction(companyId, journalEntryId)
        : dialog === "READY"
          ? await markJournalEntryReadyForPostingAction(companyId, journalEntryId)
          : await returnJournalEntryToDraftAction(companyId, journalEntryId);

      if (result.ok) {
        const message = dialog === "SEND"
          ? "Journal entry sent for review."
          : dialog === "READY"
            ? "Journal entry marked Ready for Posting."
            : "Journal entry returned to Draft.";
        toast(message, "success");
        setDialog(null);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  if (status === "DRAFT") {
    return (
      <>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog("SEND")} disabled={isPending}>
          <Send className="h-4 w-4" />
          Send for Review
        </Button>
        <Dialog
          open={dialog === "SEND"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Send Journal Entry for Review?"
          description="The entry will become In Review and editing will be locked until it is returned to Draft."
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
              <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Sending…" : "Send for Review"}</Button>
            </>
          }
        />
      </>
    );
  }

  if (status === "IN_REVIEW") {
    return (
      <>
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog("READY")} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" />
          Mark Ready for Posting
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("DRAFT")} disabled={isPending}>
          <RotateCcw className="h-4 w-4" />
          Return to Draft
        </Button>
        <Dialog
          open={dialog === "READY"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Mark Ready for Posting?"
          description="This records human review completion. It does not post the journal entry."
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
              <Button type="button" variant="primary" onClick={confirm} disabled={isPending}>{isPending ? "Saving…" : "Mark Ready"}</Button>
            </>
          }
        />
        <Dialog
          open={dialog === "DRAFT"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Return to Draft?"
          description="The entry will become editable again and must be reviewed again before it can be ready for posting."
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
              <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Saving…" : "Return to Draft"}</Button>
            </>
          }
        />
      </>
    );
  }

  if (status === "READY_FOR_POSTING") {
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("DRAFT")} disabled={isPending}>
          <RotateCcw className="h-4 w-4" />
          Return to Draft
        </Button>
        <Dialog
          open={dialog === "DRAFT"}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Return Ready Entry to Draft?"
          description="This removes the ready-for-posting state so the entry can be corrected and reviewed again."
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
              <Button type="button" variant="outline" onClick={confirm} disabled={isPending}>{isPending ? "Saving…" : "Return to Draft"}</Button>
            </>
          }
        />
      </>
    );
  }

  return null;
}
