"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
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
          <span className="truncate font-display text-sm font-semibold tracking-wide text-white">
            Ledger
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!isCollapsed && (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded px-2 py-1.5 text-sm transition-colors",
                        isCollapsed ? "justify-center" : "justify-between gap-2",
                        isActive
                          ? "bg-ink-800 text-white"
                          : "text-ink-300 hover:bg-ink-900 hover:text-white"
                      )}
                    >
                      <span className={cn("flex items-center", !isCollapsed && "gap-2.5")}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && item.label}
                      </span>
                      {!isCollapsed && !item.implemented ? (
                        <span className="rounded-sm bg-ink-800 px-1.5 py-0.5 text-[10px] font-medium text-ink-400">
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
