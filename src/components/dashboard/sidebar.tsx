"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-950 text-ink-300 lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-ink-800 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-ledger-500 font-display text-sm font-bold text-white">
          L
        </div>
        <span className="font-display text-sm font-semibold tracking-wide text-white">Ledger</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-ink-800 text-white"
                          : "text-ink-300 hover:bg-ink-900 hover:text-white"
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </span>
                      {!item.implemented ? (
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
