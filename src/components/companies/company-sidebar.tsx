"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { COMPANY_NAV_ITEMS } from "@/lib/company-nav";
import { ReportsDropdown } from "@/components/companies/reports-dropdown";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";

export function CompanySidebar({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const pathname = usePathname();
  const basePath = `/companies/${companyId}`;
  const { isCollapsed, toggle, hydrated } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 flex-col border-r border-ink-800 bg-ink-950 text-ink-300 lg:flex",
        hydrated && "transition-[width] duration-200 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Toggle handle — sits on the sidebar's right border so it stays put
          whether the sidebar is expanded or collapsed. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-ink-700 bg-ink-900 text-ink-300 shadow-sm transition-colors hover:bg-ink-800 hover:text-white"
      >
        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      <div
        className={cn(
          "flex h-14 items-center border-b border-ink-800",
          isCollapsed ? "justify-center px-0" : "gap-2 px-5"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-ledger-500 font-display text-sm font-bold text-white">
          L
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-white">{companyName}</p>
            <p className="text-[11px] text-ink-500">Company workspace</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {COMPANY_NAV_ITEMS.map((item) => {
            if (item.label === "Reports") {
              return (
                <li key={item.label}>
                  <ReportsDropdown companyId={companyId} collapsed={isCollapsed} />
                </li>
              );
            }
            const href = item.segment ? `${basePath}/${item.segment}` : basePath;
            const isActive = item.segment ? pathname.startsWith(href) : pathname === basePath;
            const Icon = item.icon;

            if (!item.implemented) {
              return (
                <li key={item.label}>
                  <span
                    className={cn(
                      "flex cursor-not-allowed items-center rounded px-2 py-1.5 text-sm text-ink-500",
                      isCollapsed ? "justify-center" : "justify-between gap-2"
                    )}
                    title={isCollapsed ? `${item.label} — coming in a future phase` : undefined}
                  >
                    <span className={cn("flex items-center", !isCollapsed && "gap-2.5")}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && item.label}
                    </span>
                    {!isCollapsed && (
                      <span className="rounded-sm bg-ink-800 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">
                        Soon
                      </span>
                    )}
                  </span>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  href={href}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded px-2 py-1.5 text-sm transition-colors",
                    isCollapsed ? "justify-center" : "gap-2.5",
                    isActive ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-900 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-ink-800 p-3">
        <Link
          href="/dashboard/companies"
          title={isCollapsed ? "All companies" : undefined}
          className={cn(
            "flex items-center rounded px-2 py-1.5 text-sm text-ink-400 hover:bg-ink-900 hover:text-white",
            isCollapsed ? "justify-center" : "gap-2"
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          {!isCollapsed && "All companies"}
        </Link>
      </div>
    </aside>
  );
}
