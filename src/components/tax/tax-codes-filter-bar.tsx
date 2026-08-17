"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TAX_TYPES,
  TAX_TYPE_LABELS,
  TAX_COUNTRIES,
  TAX_CODE_STATUSES,
  TAX_CODE_STATUS_LABELS,
} from "@/lib/constants";

export function TaxCodesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (search !== (searchParams.get("q") ?? "")) {
        updateParams({ q: search });
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(
    (searchParams.get("q") ?? "") ||
      searchParams.get("taxType") ||
      searchParams.get("country") ||
      searchParams.get("status")
  );

  function clearFilters() {
    setSearch("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("taxType");
    params.delete("country");
    params.delete("status");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or name…"
          className="pl-8"
          aria-label="Search tax codes"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.get("taxType") ?? ""}
          onChange={(e) => updateParams({ taxType: e.target.value })}
          className="w-auto"
          aria-label="Filter by tax type"
        >
          <option value="">All types</option>
          {TAX_TYPES.map((t) => (
            <option key={t} value={t}>
              {TAX_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("country") ?? ""}
          onChange={(e) => updateParams({ country: e.target.value })}
          className="w-auto"
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {TAX_COUNTRIES.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.countryName}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("status") ?? ""}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {TAX_CODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TAX_CODE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-ink-500 hover:bg-surface-muted hover:text-ink-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
