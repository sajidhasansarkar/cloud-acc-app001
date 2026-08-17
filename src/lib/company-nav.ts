import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BookText,
  Landmark,
  ListTree,
  BookOpenCheck,
  Scale,
  FileBarChart,
  ListChecks,
  ReceiptText,
  Bot,
  Settings,
} from "lucide-react";

export type CompanyNavItem = {
  label: string;
  // Path segment appended to /companies/[companyId], or "" for the
  // workspace root (Overview).
  segment: string;
  icon: LucideIcon;
  implemented: boolean;
};

// "Overview" (Phase 2B-2A), "Settings" (Phase 2B-2B-2 — General,
// Accounting, Fiscal Period, Country & Currency), and "Chart of Accounts"
// (Phase 3A-2) are functional. Every other module is still a placeholder
// route (see section 3 of the original Phase 2B-2A spec) and renders as a
// disabled, "Soon"-badged item here, matching the pattern already used by
// the org-level sidebar in src/lib/nav.ts.
export const COMPANY_NAV_ITEMS: CompanyNavItem[] = [
  { label: "Overview", segment: "", icon: LayoutDashboard, implemented: true },
  { label: "Transactions", segment: "transactions", icon: ArrowLeftRight, implemented: false },
  { label: "Journal Entries", segment: "journal-entries", icon: BookText, implemented: false },
  { label: "Banking", segment: "banking", icon: Landmark, implemented: false },
  { label: "Chart of Accounts", segment: "chart-of-accounts", icon: ListTree, implemented: true },
  { label: "General Ledger", segment: "general-ledger", icon: BookOpenCheck, implemented: false },
  { label: "Trial Balance", segment: "trial-balance", icon: Scale, implemented: false },
  { label: "Reports", segment: "reports", icon: FileBarChart, implemented: false },
  { label: "Bank Reconciliation", segment: "bank-reconciliation", icon: ListChecks, implemented: false },
  { label: "Tax", segment: "tax", icon: ReceiptText, implemented: false },
  { label: "AI Assistant", segment: "ai-assistant", icon: Bot, implemented: false },
  // Points at the Company Settings index (General tab), which itself links
  // out to the existing Fiscal Period pages rather than re-hosting them.
  { label: "Settings", segment: "settings", icon: Settings, implemented: true },
];
