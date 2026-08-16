"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { setAccountingPeriodStatusAction } from "@/actions/accounting-periods";

const STATUS_OPTIONS = ["OPEN", "CLOSED", "LOCKED"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

export function PeriodStatusAction({
  companyId,
  periodId,
  periodName,
  status,
}: {
  companyId: string;
  periodId: string;
  periodName: string;
  status: Status;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<Status>(status);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setNextStatus(status);
    setOpen(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await setAccountingPeriodStatusAction(companyId, periodId, nextStatus);
      if (result.ok) {
        toast(`Period status changed to ${nextStatus}.`, "success");
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
        onClick={handleOpen}
        title="Change status"
        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
      >
        <RefreshCw className="h-4 w-4" />
        <span className="sr-only">Change status</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Change period status"
        description={`Update the status of "${periodName}".`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={isPending || nextStatus === status}
            >
              {isPending ? "Updating…" : "Confirm"}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="periodStatus">New status</Label>
          <Select
            id="periodStatus"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as Status)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <p className="text-xs text-ink-500">Current status: {status}</p>
        </div>
      </Dialog>
    </>
  );
}
