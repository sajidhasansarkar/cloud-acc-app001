"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COMPANY_SORT_OPTIONS } from "@/lib/constants";

export type CompaniesCountryOption = { countryCode: string; countryName: string };

export function CompaniesFilterBar({
  countries,
  statuses,
}: {
  countries: CompaniesCountryOption[];
  statuses: { value: string; label: string }[];
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
    // Any filter/search/sort change resets to page 1.
    params.delete("page");
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

  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="pl-8"
          aria-label="Search companies"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={searchParams.get("country") ?? ""}
          onChange={(e) => updateParams({ country: e.target.value })}
          className="w-auto"
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
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
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get("sort") ?? "createdAt_desc"}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="w-auto"
          aria-label="Sort companies"
        >
          {COMPANY_SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
