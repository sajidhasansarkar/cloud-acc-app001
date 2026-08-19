"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account } from "@prisma/client";

/**
 * Journal Lines account selector (spec sections 3-4).
 *
 * Reuses the Chart of Accounts data the page already fetched via
 * listAccounts/listAccountsAction — this component does not fetch or
 * define accounts itself, and never shows accounts outside the
 * `accounts` prop it's given (the page is responsible for scoping that
 * list to the current company). Only active accounts are offered, since
 * inactive accounts are meant to be hidden from normal selection lists
 * (see Account.isActive in the schema).
 *
 * Search matches account code OR name (spec section 4), client-side —
 * there is no separate account search endpoint to reuse, and the Chart
 * of Accounts for a company is small enough to filter in the browser.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  disabled,
  placeholder = "Select account…",
  invalid,
}: {
  accounts: Pick<Account, "id" | "code" | "name" | "type" | "isActive">[];
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectable = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const selected = useMemo(() => accounts.find((a) => a.id === value) ?? null, [accounts, value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)
    );
  }, [selectable, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(accountId: string) {
    onChange(accountId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded border bg-white px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500 disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-negative/60" : "border-ink-200",
          selected ? "text-ink-900" : "text-ink-400"
        )}
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="font-mono text-xs text-ink-500">{selected.code}</span>
              {" — "}
              {selected.name}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-64 max-w-[80vw] rounded border border-ink-200 bg-white shadow-card">
          <div className="relative border-b border-ink-100 p-1.5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code or name…"
              className="h-8 w-full rounded border border-ink-200 pl-7 pr-2 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-400">No matching accounts.</li>
            ) : (
              results.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={account.id === value}
                    onClick={() => pick(account.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted",
                      account.id === value ? "bg-surface-muted" : ""
                    )}
                  >
                    <span className="font-mono text-xs text-ink-500">{account.code}</span>
                    <span className="truncate text-ink-800">{account.name}</span><span className="text-[10px] text-ink-400">{account.type}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
