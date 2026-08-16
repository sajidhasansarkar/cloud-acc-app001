"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateAccountingSettingsAction } from "@/actions/companies";

type Frequency = "MONTHLY" | "QUARTERLY";

export function AccountingSettingsForm({
  companyId,
  defaultPeriodFrequency,
  canManage,
}: {
  companyId: string;
  defaultPeriodFrequency: Frequency;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [frequency, setFrequency] = useState<Frequency>(defaultPeriodFrequency);
  const [isPending, startTransition] = useTransition();

  const isDirty = frequency !== defaultPeriodFrequency;

  function handleSave() {
    startTransition(async () => {
      const result = await updateAccountingSettingsAction(companyId, frequency);
      if (result.ok) {
        toast("Accounting settings saved.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="defaultPeriodFrequency">Accounting Period Frequency</Label>
        <Select
          id="defaultPeriodFrequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          disabled={!canManage}
        >
          <option value="MONTHLY">Monthly (12 periods per fiscal year)</option>
          <option value="QUARTERLY">Quarterly (4 periods per fiscal year)</option>
        </Select>
        <p className="text-xs text-ink-500">
          Pre-fills the frequency when generating accounting periods for a fiscal year. You can
          still choose the other option at generation time.
        </p>
      </div>

      {canManage ? (
        <Button type="button" variant="primary" onClick={handleSave} disabled={!isDirty || isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      ) : null}
    </div>
  );
}
