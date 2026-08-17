"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AccountingPeriod, FiscalYear } from "@prisma/client";
import { JOURNAL_ENTRY_SOURCE_TYPES, JOURNAL_ENTRY_SOURCE_TYPE_LABELS, JOURNAL_ENTRY_STATUS_LABELS, JOURNAL_ENTRY_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const DATE_PRESETS = [
  { value: "", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
] as const;

const SORT_OPTIONS = [
  { value: "entryDate_desc", label: "Entry date · Newest" },
  { value: "entryDate_asc", label: "Entry date · Oldest" },
  { value: "entryNumber_asc", label: "Entry number · A–Z" },
  { value: "entryNumber_desc", label: "Entry number · Z–A" },
  { value: "reference_asc", label: "Reference · A–Z" },
  { value: "reference_desc", label: "Reference · Z–A" },
  { value: "status_asc", label: "Status · A–Z" },
  { value: "status_desc", label: "Status · Z–A" },
  { value: "createdAt_desc", label: "Created date · Newest" },
  { value: "createdAt_asc", label: "Created date · Oldest" },
] as const;

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

export function JournalEntriesFilterBar({
  fiscalYears,
  accountingPeriods,
  labels,
}: {
  fiscalYears: FiscalYear[];
  accountingPeriods: AccountingPeriod[];
  labels: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [reference, setReference] = useState(searchParams.get("reference") ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const referenceDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();

  const currentDatePreset = searchParams.get("date") ?? "";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";
  const customDateActive = currentDatePreset === "custom";
  const dateRangeInvalid = Boolean(startDate && endDate && endDate < startDate);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setReference(searchParams.get("reference") ?? "");
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

  useEffect(() => {
    clearTimeout(referenceDebounceRef.current);
    referenceDebounceRef.current = setTimeout(() => {
      const current = searchParams.get("reference") ?? "";
      if (reference !== current) updateParams({ reference, page: "1" });
    }, 300);
    return () => clearTimeout(referenceDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => setParam(params, key, value));
    if (!Object.prototype.hasOwnProperty.call(updates, "page")) params.delete("page");
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function updateFiscalYear(value: string) {
    updateParams({ fiscalYearId: value, accountingPeriodId: "", page: "1" });
  }

  function updateDatePreset(value: string) {
    updateParams({ date: value, startDate: value === "custom" ? startDate : "", endDate: value === "custom" ? endDate : "", page: "1" });
  }

  function clearFilters() {
    setSearch("");
    setReference("");
    const params = new URLSearchParams(searchParams.toString());
    ["search", "status", "source", "date", "startDate", "endDate", "fiscalYearId", "accountingPeriodId", "label", "reference", "sort", "direction", "page"].forEach((key) => params.delete(key));
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  const activeFilters = useMemo(() => {
    const values = [
      searchParams.get("search"),
      searchParams.get("status"),
      searchParams.get("source"),
      searchParams.get("date"),
      searchParams.get("startDate"),
      searchParams.get("endDate"),
      searchParams.get("fiscalYearId"),
      searchParams.get("accountingPeriodId"),
      searchParams.get("label"),
      searchParams.get("reference"),
    ];
    return values.filter(Boolean).length;
  }, [searchParams]);

  const selectedFiscalYearId = searchParams.get("fiscalYearId") ?? "";
  const selectedPeriodId = searchParams.get("accountingPeriodId") ?? "";

  return (
    <div className="space-y-3 border-b border-ink-100 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search entry number, reference, description, label…"
            className="pl-9"
            aria-label="Search journal entries"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeFilters ? `${activeFilters} filters active` : "All journal entries"}
          {activeFilters ? (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-medium text-ledger-600 hover:text-ledger-700">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Select value={searchParams.get("status") ?? ""} onChange={(event) => updateParams({ status: event.target.value, page: "1" })} aria-label="Filter by status">
          <option value="">All statuses</option>
          {JOURNAL_ENTRY_STATUSES.map((status) => <option key={status} value={status}>{JOURNAL_ENTRY_STATUS_LABELS[status]}</option>)}
        </Select>

        <Select value={searchParams.get("source") ?? ""} onChange={(event) => updateParams({ source: event.target.value, page: "1" })} aria-label="Filter by source">
          <option value="">All sources</option>
          {JOURNAL_ENTRY_SOURCE_TYPES.map((source) => <option key={source} value={source}>{JOURNAL_ENTRY_SOURCE_TYPE_LABELS[source]}</option>)}
        </Select>

        <Select value={selectedFiscalYearId} onChange={(event) => updateFiscalYear(event.target.value)} aria-label="Filter by fiscal year">
          <option value="">All fiscal years</option>
          {fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </Select>

        <Select value={selectedPeriodId} onChange={(event) => updateParams({ accountingPeriodId: event.target.value, page: "1" })} disabled={!selectedFiscalYearId} aria-label="Filter by accounting period">
          <option value="">All accounting periods</option>
          {accountingPeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </Select>

        <Select value={searchParams.get("label") ?? ""} onChange={(event) => updateParams({ label: event.target.value, page: "1" })} aria-label="Filter by label">
          <option value="">All labels</option>
          {labels.map((label) => <option key={label} value={label}>{label}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.2fr]">
        <div className="relative">
          <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reference contains…" aria-label="Filter by reference" />
        </div>

        <Select value={currentDatePreset} onChange={(event) => updateDatePreset(event.target.value)} aria-label="Filter by date">
          {DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </Select>

        <Input type="date" value={startDate} disabled={!customDateActive} onChange={(event) => updateParams({ date: "custom", startDate: event.target.value, page: "1" })} aria-label="Start date" />
        <Input type="date" value={endDate} disabled={!customDateActive} onChange={(event) => updateParams({ date: "custom", endDate: event.target.value, page: "1" })} aria-label="End date" />

        <Select
          value={`${searchParams.get("sort") ?? "entryDate"}_${searchParams.get("direction") ?? "desc"}`}
          onChange={(event) => {
            const [sort, direction] = event.target.value.split("_");
            updateParams({ sort, direction, page: "1" });
          }}
          aria-label="Sort journal entries"
        >
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </div>

      {customDateActive && dateRangeInvalid ? (
        <div className="flex items-center gap-2 text-xs text-negative">
          <CalendarDays className="h-3.5 w-3.5" /> End Date must be on or after Start Date.
        </div>
      ) : null}

      {activeFilters ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <FilterChip label="Search" value={searchParams.get("search")} onRemove={() => updateParams({ search: "", page: "1" })} />
          <FilterChip label="Status" value={searchParams.get("status")} onRemove={() => updateParams({ status: "", page: "1" })} />
          <FilterChip label="Source" value={searchParams.get("source")} onRemove={() => updateParams({ source: "", page: "1" })} />
          <FilterChip label="Fiscal Year" value={fiscalYears.find((year) => year.id === selectedFiscalYearId)?.name ?? selectedFiscalYearId} onRemove={() => updateFiscalYear("")} />
          <FilterChip label="Period" value={accountingPeriods.find((period) => period.id === selectedPeriodId)?.name ?? selectedPeriodId} onRemove={() => updateParams({ accountingPeriodId: "", page: "1" })} />
          <FilterChip label="Label" value={searchParams.get("label")} onRemove={() => updateParams({ label: "", page: "1" })} />
          <FilterChip label="Reference" value={searchParams.get("reference")} onRemove={() => updateParams({ reference: "", page: "1" })} />
          <FilterChip label="Date" value={currentDatePreset === "today" ? "Today" : currentDatePreset === "this_month" ? "This month" : startDate || endDate ? `${startDate || "…"} – ${endDate || "…"}` : null} onRemove={() => updateParams({ date: "", startDate: "", endDate: "", page: "1" })} />
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
