"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { COMPANY_NAV_ITEMS } from "@/lib/company-nav";
import { cn } from "@/lib/utils";

export function CompanySidebar({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const pathname = usePathname();
  const basePath = `/companies/${companyId}`;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-950 text-ink-300 lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-ink-800 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-ledger-500 font-display text-sm font-bold text-white">
          L
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-white">{companyName}</p>
          <p className="text-[11px] text-ink-500">Company workspace</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {COMPANY_NAV_ITEMS.map((item) => {
            const href = item.segment ? `${basePath}/${item.segment}` : basePath;
            const isActive = item.segment ? pathname.startsWith(href) : pathname === basePath;
            const Icon = item.icon;

            if (!item.implemented) {
              return (
                <li key={item.label}>
                  <span
                    className="flex cursor-not-allowed items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-ink-500"
                    title={`${item.label} — coming in a future phase`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>
                    <span className="rounded-sm bg-ink-800 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">
                      Soon
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors",
                    isActive ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-900 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-ink-800 p-3">
        <Link
          href="/dashboard/companies"
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-900 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All companies
        </Link>
      </div>
    </aside>
  );
}
