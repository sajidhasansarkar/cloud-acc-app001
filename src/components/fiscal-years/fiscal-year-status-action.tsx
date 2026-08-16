"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { setFiscalYearStatusAction } from "@/actions/fiscal-years";

const STATUS_OPTIONS = ["OPEN", "CLOSED", "LOCKED"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

export function FiscalYearStatusAction({
  companyId,
  fiscalYearId,
  fiscalYearName,
  status,
}: {
  companyId: string;
  fiscalYearId: string;
  fiscalYearName: string;
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
      const result = await setFiscalYearStatusAction(companyId, fiscalYearId, nextStatus);
      if (result.ok) {
        toast(`Fiscal year status changed to ${nextStatus}.`, "success");
        setOpen(false);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={handleOpen}>
        <RefreshCw className="h-3.5 w-3.5" />
        Change Status
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Change fiscal year status"
        description={`Update the status of "${fiscalYearName}".`}
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
          <Label htmlFor="fiscalYearStatus">New status</Label>
          <Select
            id="fiscalYearStatus"
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
