"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, ChevronDown, FileBarChart, Scale, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const REPORTS = [
  { label: "General Ledger", segment: "general-ledger", icon: BookOpenCheck },
  { label: "Trial Balance", segment: "trial-balance", icon: Scale },
  { label: "Balance Sheet", segment: "balance-sheet", icon: FileBarChart },
  { label: "Income Statement", segment: "income-statement", icon: FileBarChart },
  { label: "Cash Flow", segment: "cash-flow", icon: WalletCards },
  { label: "GST/HST Return", segment: "reports/gst-hst", icon: FileBarChart },
];

export function ReportsDropdown({
  companyId,
  className,
  collapsed = false,
}: {
  companyId: string;
  className?: string;
  // Icon-only mode for use inside a collapsed sidebar. The dropdown's
  // expanding submenu doesn't have room to lay out there, so this renders
  // as a single link to the reports index instead of a toggle + menu.
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const basePath = `/companies/${companyId}`;
  const activeReport = REPORTS.find((report) => pathname.startsWith(`${basePath}/${report.segment}`));
  const inReportsSection = Boolean(activeReport) || pathname.startsWith(`${basePath}/reports`);

  // The dropdown lives in a layout that stays mounted across navigation
  // within the company workspace, so a plain "closed by default" state
  // would otherwise collapse the panel the moment a report link is
  // clicked, even though the sidebar itself never unmounts. `manualOpen`
  // only overrides the section-derived default until the user leaves the
  // Reports section, at which point it resets so returning later re-opens
  // (or stays closed) based on the route again.
  //
  // These hooks run unconditionally (before the `collapsed` early return
  // below) — React requires hook calls to happen in the same order on
  // every render, so they can't be skipped just because the collapsed
  // variant doesn't need their result.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? inReportsSection;

  useEffect(() => {
    if (!inReportsSection) setManualOpen(null);
  }, [inReportsSection]);

  if (collapsed) {
    return (
      <Link
        href={`${basePath}/reports`}
        title="Reports"
        className={cn(
          "flex items-center justify-center rounded px-2 py-1.5 text-sm transition-colors",
          inReportsSection ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-900 hover:text-white",
          className
        )}
      >
        <FileBarChart className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setManualOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition-colors",
          inReportsSection
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
