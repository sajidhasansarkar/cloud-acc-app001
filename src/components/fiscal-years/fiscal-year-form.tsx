"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createFiscalYearAction, updateFiscalYearAction } from "@/actions/fiscal-years";

function toDateInputValue(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function FiscalYearForm({
  mode,
  companyId,
  fiscalYear,
  cancelHref,
}: {
  mode: "create" | "edit";
  companyId: string;
  fiscalYear?: { id: string; name: string; startDate: Date | string; endDate: Date | string };
  cancelHref: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(fiscalYear?.name ?? "");
  const [startDate, setStartDate] = useState(fiscalYear ? toDateInputValue(fiscalYear.startDate) : "");
  const [endDate, setEndDate] = useState(fiscalYear ? toDateInputValue(fiscalYear.endDate) : "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !startDate || !endDate) {
      setError("All fields are required.");
      return;
    }
    if (!(new Date(endDate).getTime() > new Date(startDate).getTime())) {
      setError("End date must be after the start date.");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "edit" && fiscalYear
          ? await updateFiscalYearAction({
              companyId,
              fiscalYearId: fiscalYear.id,
              name: name.trim(),
              startDate,
              endDate,
            })
          : await createFiscalYearAction({ companyId, name: name.trim(), startDate, endDate });

      if (result.ok) {
        toast(mode === "edit" ? "Fiscal year updated." : "Fiscal year created.", "success");
        router.push(`/companies/${companyId}/settings/fiscal-period/${result.fiscalYear.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      {error ? (
        <div className="flex items-start gap-2 rounded border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">
          Fiscal Year Name<span className="text-negative"> *</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="FY2026"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">
            Start Date<span className="text-negative"> *</span>
          </Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">
            End Date<span className="text-negative"> *</span>
          </Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-6">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending
            ? mode === "edit"
              ? "Saving…"
              : "Creating…"
            : mode === "edit"
              ? "Save changes"
              : "Create fiscal year"}
        </Button>
        <a href={cancelHref} className="text-sm text-ink-500 hover:text-ink-800">
          Cancel
        </a>
      </div>
    </form>
  );
}
