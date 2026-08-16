"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { generateAccountingPeriodsAction } from "@/actions/accounting-periods";

type Frequency = "MONTHLY" | "QUARTERLY";

export function GeneratePeriodsDialog({
  companyId,
  fiscalYearId,
  disabled,
  defaultFrequency = "MONTHLY",
}: {
  companyId: string;
  fiscalYearId: string;
  /** True once periods already exist — generation can only run once. */
  disabled?: boolean;
  /**
   * Pre-selects the frequency dropdown. Sourced from the company's
   * Accounting Settings (Company Settings → Accounting tab, Phase
   * 2B-2B-2) — purely a starting value, the user can still pick the other
   * option before generating.
   */
  defaultFrequency?: Frequency;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>(defaultFrequency);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateAccountingPeriodsAction({ companyId, fiscalYearId, frequency });
      if (result.ok) {
        toast(`Generated ${result.periods.length} accounting periods.`, "success");
        setOpen(false);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Periods already exist for this fiscal year" : undefined}
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Generate Periods
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Generate accounting periods"
        description="Split this fiscal year into periods. Period 1 always starts on the fiscal year's start date. This can only be run once per fiscal year."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Generating…" : "Generate"}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="frequency">Frequency</Label>
          <Select
            id="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="MONTHLY">Monthly (12 periods)</option>
            <option value="QUARTERLY">Quarterly (4 periods)</option>
          </Select>
        </div>
      </Dialog>
    </>
  );
}
