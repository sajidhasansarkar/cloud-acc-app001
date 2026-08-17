"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MAPPING_SOURCE_TYPES, MAPPING_SOURCE_TYPE_LABELS, MAPPING_STATUSES, MAPPING_STATUS_LABELS } from "@/lib/constants";
import type { AccountOption, TaxCodeOption } from "@/components/mapping/types";

export function MappingsFilterBar({
  accounts,
  taxCodes,
}: {
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
}) {
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
      searchParams.get("sourceType") ||
      searchParams.get("accountId") ||
      searchParams.get("taxCodeId") ||
      searchParams.get("status")
  );

  function clearFilters() {
    setSearch("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("sourceType");
    params.delete("accountId");
    params.delete("taxCodeId");
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
          placeholder="Search by name or source value…"
          className="pl-8"
          aria-label="Search account mappings"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.get("sourceType") ?? ""}
          onChange={(e) => updateParams({ sourceType: e.target.value })}
          className="w-auto"
          aria-label="Filter by source type"
        >
          <option value="">All source types</option>
          {MAPPING_SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {MAPPING_SOURCE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("accountId") ?? ""}
          onChange={(e) => updateParams({ accountId: e.target.value })}
          className="w-auto"
          aria-label="Filter by account"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("taxCodeId") ?? ""}
          onChange={(e) => updateParams({ taxCodeId: e.target.value })}
          className="w-auto"
          aria-label="Filter by tax code"
        >
          <option value="">All tax codes</option>
          {taxCodes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
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
          {MAPPING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MAPPING_STATUS_LABELS[s]}
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
