"use client";

import { useState, useTransition } from "react";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { postJournalEntryAction } from "@/actions/journal-entries";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function JournalEntryPostAction({
  companyId,
  journalEntryId,
  entryNumber,
  entryDate,
  totalDebit,
  totalCredit,
  difference,
  lineCount,
}: {
  companyId: string;
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  lineCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handlePost() {
    startTransition(async () => {
      const result = await postJournalEntryAction(companyId, journalEntryId);
      if (result.ok) {
        setOpen(false);
        toast("Journal Entry posted successfully.", "success");
        router.push(`/companies/${companyId}/journal-entries/${journalEntryId}`);
        router.refresh();
      } else {
        toast(result.error, "error");
        if (result.error === "Journal Entry has already been posted.") {
          setOpen(false);
          router.refresh();
        }
      }
    });
  }

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <LockKeyhole className="h-4 w-4" />
        Post Journal Entry
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => !isPending && setOpen(next)}
        title="Post Journal Entry?"
        description="Please confirm the final posting details."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handlePost} disabled={isPending}>
              {isPending ? "Posting…" : "Confirm Post"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-ink-500">Journal Entry Number</p><p className="font-medium">{entryNumber}</p></div>
            <div><p className="text-xs text-ink-500">Date</p><p className="font-medium">{entryDate}</p></div>
            <div><p className="text-xs text-ink-500">Total Debit</p><p className="font-medium">{totalDebit}</p></div>
            <div><p className="text-xs text-ink-500">Total Credit</p><p className="font-medium">{totalCredit}</p></div>
            <div><p className="text-xs text-ink-500">Difference</p><p className="font-medium">{difference}</p></div>
            <div><p className="text-xs text-ink-500">Number of Lines</p><p className="font-medium">{lineCount}</p></div>
          </div>
          <div className="rounded-md border border-pending/30 bg-pending/5 px-3 py-2 font-medium text-ink-800">
            Once posted, this Journal Entry cannot be edited.
          </div>
        </div>
      </Dialog>
    </>
  );
}
