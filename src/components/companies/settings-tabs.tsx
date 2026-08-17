"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Calculator,
  CalendarRange,
  Globe2,
  ReceiptText,
  ListTree,
  Landmark,
  Bot,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SettingsTab = {
  label: string;
  href: string;
  icon: typeof Building2;
  implemented: true;
};

type SettingsPlaceholder = {
  label: string;
  icon: typeof Building2;
  implemented: false;
};

type SettingsNavItem = SettingsTab | SettingsPlaceholder;

// The four Phase 2B-2B-2 tabs, plus Tax (Phase 3B-2). "Fiscal Period"
// deliberately points at the existing, already-built Phase 2B-2B-1 route
// instead of a page nested under this tab bar — that page keeps its own
// header/actions and is not rebuilt here (see spec section 5).
function getTabs(companyId: string): SettingsNavItem[] {
  const base = `/companies/${companyId}/settings`;
  return [
    { label: "General", href: `${base}/general`, icon: Building2, implemented: true },
    { label: "Accounting", href: `${base}/accounting`, icon: Calculator, implemented: true },
    { label: "Fiscal Period", href: `${base}/fiscal-period`, icon: CalendarRange, implemented: true },
    { label: "Country & Currency", href: `${base}/country-currency`, icon: Globe2, implemented: true },
    { label: "Tax", href: `${base}/tax`, icon: ReceiptText, implemented: true },
    // Future modules — placeholders only, per spec section 8. Not routes,
    // not clickable, so there's nothing here that could be mistaken for
    // real functionality.
    { label: "Chart of Accounts", icon: ListTree, implemented: false },
    { label: "Bank Rules", icon: Landmark, implemented: false },
    { label: "AI Rules", icon: Bot, implemented: false },
    { label: "Integrations", icon: Plug, implemented: false },
  ];
}

export function SettingsTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const tabs = getTabs(companyId);

  return (
    <nav aria-label="Company settings sections" className="border-b border-ink-100">
      <ul className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          if (!tab.implemented) {
            return (
              <li key={tab.label}>
                <span
                  title={`${tab.label} — available in a future phase`}
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-t px-3 py-2 text-sm text-ink-400"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                  <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-400">
                    Soon
                  </span>
                </span>
              </li>
            );
          }

          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-b-2 border-ledger-500 text-ledger-600"
                    : "border-b-2 border-transparent text-ink-500 hover:text-ink-800"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
