"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { setAccountMappingActiveAction } from "@/actions/account-mappings";

export function MappingStatusAction({
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

  const nextActive = !isActive;

  function handleConfirm() {
    startTransition(async () => {
      const result = await setAccountMappingActiveAction(companyId, mappingId, nextActive);
      if (result.ok) {
        toast(nextActive ? "Mapping activated." : "Mapping deactivated.", "success");
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
        title={isActive ? "Deactivate mapping" : "Activate mapping"}
        description={
          isActive
            ? `"${mappingLabel}" will be hidden from normal mapping selection. It stays stored intact and can be reactivated anytime.`
            : `"${mappingLabel}" will become active again.`
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
