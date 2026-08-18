"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FileBarChart, Scale, WalletCards } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const REPORTS = [
  { label: "Trial Balance", segment: "trial-balance", icon: Scale },
  { label: "Balance Sheet", segment: "balance-sheet", icon: FileBarChart },
  { label: "Income Statement", segment: "income-statement", icon: FileBarChart },
  { label: "Cash Flow", segment: "cash-flow", icon: WalletCards },
];

export function ReportsDropdown({ companyId, className }: { companyId: string; className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const basePath = `/companies/${companyId}`;
  const activeReport = REPORTS.find((report) => pathname.startsWith(`${basePath}/${report.segment}`));

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition-colors",
          activeReport || pathname.startsWith(`${basePath}/reports`)
            ? "bg-ink-800 text-white"
            : "text-ink-300 hover:bg-ink-900 hover:text-white"
        )}
      >
        <span className="flex items-center gap-2.5"><FileBarChart className="h-4 w-4 shrink-0" />Reports</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="mt-1 overflow-hidden rounded border border-ink-800 bg-ink-900 shadow-lg">
          {REPORTS.map((report) => {
            const Icon = report.icon;
            const href = `${basePath}/${report.segment}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={report.segment}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  active ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-800 hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1">{report.label}</span>
                {active && <span className="text-[10px] text-ledger-300">Active</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
