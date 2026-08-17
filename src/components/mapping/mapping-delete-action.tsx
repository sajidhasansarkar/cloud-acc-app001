"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteAccountMappingAction } from "@/actions/account-mappings";

// Deletion is a secondary action to deactivation (spec: "Prefer
// deactivation over deletion"). This dialog says so explicitly and only
// ever offers a hard delete for an already-inactive mapping — an active
// one should be deactivated first. The server action
// (deleteAccountMappingAction -> deleteAccountMapping) still re-checks
// that the mapping isn't referenced elsewhere before deleting, so this is
// a UX nudge, not the only safety net.
export function MappingDeleteAction({
  companyId,
  mappingId,
  mappingLabel,
  isActive,
}: {
  companyId: string;
  mappingId: string;
  mappingLabel: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteAccountMappingAction(companyId, mappingId);
      if (result.ok) {
        toast("Mapping deleted.", "success");
        setOpen(false);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        title="Delete"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-negative/10 hover:text-negative"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Delete</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete mapping"
        description={
          isActive
            ? `"${mappingLabel}" is still active. Consider deactivating it instead — deactivated mappings stay stored and can be reactivated anytime, while deletion is permanent.`
            : `This permanently deletes "${mappingLabel}". This can't be undone.`
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      />
    </>
  );
}
