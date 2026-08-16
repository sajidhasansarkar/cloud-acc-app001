"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Plus, Search } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type CompanySelectorItem = {
  id: string;
  displayName: string;
  status: string;
};

export function CompanySelector({
  companies,
  activeCompanyId,
  basePath = "/dashboard/companies",
}: {
  companies: CompanySelectorItem[];
  activeCompanyId?: string;
  // Where selecting a company should navigate to: "${basePath}/${companyId}".
  // Defaults to the Phase 2A company management route. The Phase 2B-2A
  // company workspace passes "/companies" so switching companies while
  // inside the workspace stays inside the workspace instead of dropping
  // back to the management list.
  basePath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const active = companies.find((c) => c.id === activeCompanyId);
  const filtered = query.trim()
    ? companies.filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()))
    : companies;

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-800 shadow-sm hover:bg-surface-muted"
      >
        <Building2 className="h-4 w-4 text-ink-400" />
        <span className="max-w-[160px] truncate">{active ? active.displayName : "Select a company"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>

      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-ink-100 bg-white py-1 shadow-lg">
          <div className="px-2 pb-1.5 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies…"
                className="h-8 w-full rounded border border-ink-200 bg-white pl-7 pr-2 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-500">
                {companies.length === 0 ? "No companies yet." : "No matches."}
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`${basePath}/${c.id}`);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted",
                    c.id === activeCompanyId ? "bg-surface-muted font-medium text-ink-900" : "text-ink-700"
                  )}
                >
                  <span className="truncate">{c.displayName}</span>
                  <span className="ml-2 shrink-0 text-xs text-ink-400">{c.status}</span>
                </button>
              ))
            )}
          </div>
          <div className="mt-1 border-t border-ink-100 pt-1">
            <Link
              href="/dashboard/companies/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ledger-600 hover:bg-ledger-50"
            >
              <Plus className="h-4 w-4" />
              Create company
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
