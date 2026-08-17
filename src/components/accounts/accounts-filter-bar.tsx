"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, List, ListTree, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_SORT_OPTIONS,
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/constants";

export function AccountsFilterBar({ subtypes }: { subtypes: string[] }) {
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

  const view = searchParams.get("view") === "list" ? "list" : "tree";
  const hasFilters = Boolean(
    (searchParams.get("q") ?? "") ||
      searchParams.get("type") ||
      searchParams.get("subtype") ||
      searchParams.get("status")
  );

  function clearFilters() {
    setSearch("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("type");
    params.delete("subtype");
    params.delete("status");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or name…"
            className="pl-8"
            aria-label="Search accounts"
          />
        </div>

        <div className="inline-flex items-center rounded border border-ink-200 p-0.5">
          <button
            type="button"
            onClick={() => updateParams({ view: "tree" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium",
              view === "tree" ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-800"
            )}
            aria-pressed={view === "tree"}
          >
            <ListTree className="h-3.5 w-3.5" />
            Tree
          </button>
          <button
            type="button"
            onClick={() => updateParams({ view: "list" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium",
              view === "list" ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-800"
            )}
            aria-pressed={view === "list"}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.get("type") ?? ""}
          onChange={(e) => updateParams({ type: e.target.value })}
          className="w-auto"
          aria-label="Filter by account type"
        >
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("subtype") ?? ""}
          onChange={(e) => updateParams({ subtype: e.target.value })}
          className="w-auto"
          aria-label="Filter by subtype"
        >
          <option value="">All subtypes</option>
          {subtypes.map((s) => (
            <option key={s} value={s}>
              {s}
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
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ACCOUNT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("sort") ?? "code_asc"}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="w-auto"
          aria-label="Sort accounts"
        >
          {ACCOUNT_SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
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
