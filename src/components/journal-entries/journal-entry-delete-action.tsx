"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteJournalEntryAction } from "@/actions/journal-entries";
import type { JournalEntryStatus } from "@prisma/client";

export function JournalEntryDeleteAction({
  companyId,
  journalEntryId,
  entryNumber,
  status,
}: {
  companyId: string;
  journalEntryId: string;
  entryNumber: string;
  status: JournalEntryStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canDelete = status === "DRAFT";

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteJournalEntryAction(companyId, journalEntryId);
      if (result.ok) {
        toast("Draft journal entry deleted.", "success");
        setOpen(false);
        router.push(`/companies/${companyId}/journal-entries`);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  if (!canDelete) {
    return (
      <Button type="button" variant="outline" size="sm" disabled title={status === "POSTED" ? "Posted journal entries are locked." : status === "VOID" ? "Void journal entries cannot be modified." : "Entries in review or ready for posting cannot be deleted."}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
    );
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this draft journal entry?"
        description={`"${entryNumber}" will be permanently deleted together with its journal lines. This action cannot be undone.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete draft"}
            </Button>
          </>
        }
      />
    </>
  );
}
