"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { setAccountActiveAction } from "@/actions/accounts";

export function AccountStatusAction({
  companyId,
  accountId,
  accountLabel,
  isActive,
}: {
  companyId: string;
  accountId: string;
  accountLabel: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nextActive = !isActive;

  function handleConfirm() {
    startTransition(async () => {
      const result = await setAccountActiveAction(companyId, accountId, nextActive);
      if (result.ok) {
        toast(nextActive ? "Account activated." : "Account deactivated.", "success");
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
        title={isActive ? "Deactivate" : "Activate"}
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
      >
        {isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        <span className="sr-only">{isActive ? "Deactivate" : "Activate"}</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={isActive ? "Deactivate account" : "Activate account"}
        description={
          isActive
            ? `"${accountLabel}" will be hidden from normal account pickers. It stays stored with its history intact and can be reactivated anytime.`
            : `"${accountLabel}" will become available again in account pickers.`
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={isActive ? "destructive" : "primary"}
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? "Updating…" : isActive ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />
    </>
  );
}
