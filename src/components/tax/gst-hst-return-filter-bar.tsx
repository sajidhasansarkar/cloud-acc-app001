"use client";

import type { AccountingPeriod, FiscalYear } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export function GstHstReturnFilterBar({ fiscalYears, accountingPeriods, values }: {
  fiscalYears: Pick<FiscalYear, "id" | "name" | "startDate" | "endDate">[];
  accountingPeriods: Pick<AccountingPeriod, "id" | "fiscalYearId" | "name" | "startDate" | "endDate">[];
  values: { dateFrom: string; dateTo: string; fiscalYearId?: string; accountingPeriodId?: string };
}) {
  const [fiscalYearId, setFiscalYearId] = useState(values.fiscalYearId ?? "");
  const [periodId, setPeriodId] = useState(values.accountingPeriodId ?? "");
  const selectedFiscalYear = fiscalYears.find((year) => year.id === fiscalYearId);
  const visiblePeriods = useMemo(
    () => accountingPeriods.filter((period) => !fiscalYearId || period.fiscalYearId === fiscalYearId),
    [accountingPeriods, fiscalYearId],
  );
  const selectedPeriod = visiblePeriods.find((period) => period.id === periodId);
  const minDate = selectedPeriod?.startDate ?? selectedFiscalYear?.startDate;
  const maxDate = selectedPeriod?.endDate ?? selectedFiscalYear?.endDate;

  useEffect(() => {
    if (periodId && !visiblePeriods.some((period) => period.id === periodId)) setPeriodId("");
  }, [periodId, visiblePeriods]);

  return (
    <form method="get" className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-semibold text-ink-800">Report Filters</h2><p className="text-xs text-ink-500">Only POSTED Journal Entries and Journal Lines are included.</p></div>
        {selectedFiscalYear ? <p className="text-xs text-ink-500">Fiscal year: <span className="font-medium text-ink-700">{selectedFiscalYear.name}</span></p> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">From Date</span><Input name="dateFrom" type="date" required min={minDate ? isoDate(minDate) : undefined} max={maxDate ? isoDate(maxDate) : undefined} defaultValue={values.dateFrom} /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">To Date</span><Input name="dateTo" type="date" required min={minDate ? isoDate(minDate) : undefined} max={maxDate ? isoDate(maxDate) : undefined} defaultValue={values.dateTo} /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Fiscal Year</span>
          <Select name="fiscalYearId" value={fiscalYearId} onChange={(event) => setFiscalYearId(event.target.value)}><option value="">All fiscal years</option>{fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Accounting Period</span>
          <Select name="accountingPeriodId" value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">All periods</option>{visiblePeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</Select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="submit" variant="primary" size="sm">Apply filters</Button><a href="?" className="text-xs font-medium text-ink-500 hover:text-ink-800">Clear</a></div>
    </form>
  );
}
