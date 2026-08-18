"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FiscalYear, AccountingPeriod } from "@prisma/client";

const SORT_OPTIONS = [
  { value: "entryDate_desc", label: "Date (newest)" },
  { value: "entryDate_asc", label: "Date (oldest)" },
  { value: "entryNumber_asc", label: "Entry Number (A–Z)" },
  { value: "entryNumber_desc", label: "Entry Number (Z–A)" },
  { value: "totalDebit_desc", label: "Total Debit (high–low)" },
  { value: "totalDebit_asc", label: "Total Debit (low–high)" },
  { value: "totalCredit_desc", label: "Total Credit (high–low)" },
  { value: "totalCredit_asc", label: "Total Credit (low–high)" },
] as const;

export function ReadyForPostingFilterBar({
  fiscalYears,
  accountingPeriods,
}: {
  fiscalYears: FiscalYear[];
  accountingPeriods: AccountingPeriod[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const current = searchParams.get("search") ?? "";
      if (search !== current) updateParams({ search, page: "1" });
    }, 300);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    if (!Object.prototype.hasOwnProperty.call(updates, "page")) params.delete("page");
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function clearFilters() {
    setSearch("");
    const params = new URLSearchParams(searchParams.toString());
    ["search", "date", "fiscalYearId", "accountingPeriodId", "sort", "direction", "status", "page"].forEach((key) => params.delete(key));
    startTransition(() => router.push(pathname));
  }

  const selectedFiscalYearId = searchParams.get("fiscalYearId") ?? "";
  const selectedPeriodId = searchParams.get("accountingPeriodId") ?? "";
  const activeFilters = useMemo(
    () => [searchParams.get("search"), searchParams.get("date"), selectedFiscalYearId, selectedPeriodId, searchParams.get("status")].filter(Boolean).length,
    [searchParams, selectedFiscalYearId, selectedPeriodId]
  );

  return (
    <div className="space-y-3 border-b border-ink-100 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search entry number, reference, description…"
            className="pl-9"
            aria-label="Search ready-for-posting journal entries"
            disabled={pending}
          />
        </div>
        <div className="text-xs text-ink-500">
          {activeFilters ? `${activeFilters} filters active` : "All ready-for-posting entries"}
          {activeFilters ? (
            <button type="button" onClick={clearFilters} className="ml-3 inline-flex items-center gap-1 font-medium text-ledger-600 hover:text-ledger-700">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Select value={searchParams.get("status") ?? "READY_FOR_POSTING"} onChange={(event) => updateParams({ status: event.target.value, page: "1" })} aria-label="Filter by status">
          <option value="READY_FOR_POSTING">Ready for Posting</option>
        </Select>
        <Input type="date" value={searchParams.get("date") ?? ""} onChange={(event) => updateParams({ date: event.target.value, page: "1" })} aria-label="Filter by date" />
        <Select value={selectedFiscalYearId} onChange={(event) => updateParams({ fiscalYearId: event.target.value, accountingPeriodId: "", page: "1" })} aria-label="Filter by fiscal year">
          <option value="">All fiscal years</option>
          {fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </Select>
        <Select value={selectedPeriodId} onChange={(event) => updateParams({ accountingPeriodId: event.target.value, page: "1" })} disabled={!selectedFiscalYearId} aria-label="Filter by accounting period">
          <option value="">All accounting periods</option>
          {accountingPeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </Select>
        <Select
          value={`${searchParams.get("sort") ?? "entryDate"}_${searchParams.get("direction") ?? "desc"}`}
          onChange={(event) => {
            const [sort, direction] = event.target.value.split("_");
            updateParams({ sort, direction, page: "1" });
          }}
          aria-label="Sort ready-for-posting journal entries"
        >
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </div>

      {activeFilters ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <FilterChip label="Search" value={searchParams.get("search")} onRemove={() => updateParams({ search: "", page: "1" })} />
          <FilterChip label="Status" value="Ready for Posting" onRemove={() => updateParams({ status: "", page: "1" })} />
          <FilterChip label="Date" value={searchParams.get("date")} onRemove={() => updateParams({ date: "", page: "1" })} />
          <FilterChip label="Fiscal Year" value={fiscalYears.find((year) => year.id === selectedFiscalYearId)?.name} onRemove={() => updateParams({ fiscalYearId: "", accountingPeriodId: "", page: "1" })} />
          <FilterChip label="Period" value={accountingPeriods.find((period) => period.id === selectedPeriodId)?.name} onRemove={() => updateParams({ accountingPeriodId: "", page: "1" })} />
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, value, onRemove }: { label: string; value: string | null | undefined; onRemove: () => void }) {
  if (!value) return null;
  return (
    <button type="button" onClick={onRemove} className={cn("inline-flex max-w-full items-center gap-1 rounded-full border border-ink-200 bg-surface-muted px-2.5 py-1 text-xs text-ink-700 hover:bg-white")}>
      <span className="font-medium">{label}:</span>
      <span className="truncate">{value}</span>
      <X className="h-3 w-3 shrink-0 text-ink-400" />
      <span className="sr-only">Remove {label} filter</span>
    </button>
  );
}
