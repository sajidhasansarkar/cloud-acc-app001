import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  BookText,
  Landmark,
  ListTree,
  BookOpenCheck,
  Scale,
  FileBarChart,
  LineChart,
  Bot,
  Upload,
  Download,
  Users,
  CalendarRange,
  ShieldCheck,
  Sparkles,
  ReceiptText,
  Map,
  Plug,
  History,
  Settings,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  implemented: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, implemented: true },
      { label: "Companies", href: "/dashboard/companies", icon: Building2, implemented: true },
    ],
  },
  {
    label: "Bookkeeping",
    items: [
      { label: "Transactions", href: "/dashboard/transactions", icon: ArrowLeftRight, implemented: false },
      { label: "Journal Entries", href: "/dashboard/journal-entries", icon: BookText, implemented: false },
      { label: "Bank Reconciliation", href: "/dashboard/bank-reconciliation", icon: Landmark, implemented: false },
      { label: "Chart of Accounts", href: "/dashboard/chart-of-accounts", icon: ListTree, implemented: false },
      { label: "General Ledger", href: "/dashboard/general-ledger", icon: BookOpenCheck, implemented: false },
      { label: "Trial Balance", href: "/dashboard/trial-balance", icon: Scale, implemented: false },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/dashboard/reports", icon: FileBarChart, implemented: false },
      { label: "Analytics", href: "/dashboard/analytics", icon: LineChart, implemented: false },
      { label: "AI Agents", href: "/dashboard/ai-agents", icon: Bot, implemented: false },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Import Center", href: "/dashboard/import-center", icon: Upload, implemented: false },
      { label: "Export Data", href: "/dashboard/export-data", icon: Download, implemented: false },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Members", href: "/dashboard/members", icon: Users, implemented: false },
      { label: "Fiscal Period", href: "/dashboard/fiscal-period", icon: CalendarRange, implemented: false },
      { label: "Bank Rules", href: "/dashboard/bank-rules", icon: ShieldCheck, implemented: false },
      { label: "AI Rules", href: "/dashboard/ai-rules", icon: Sparkles, implemented: false },
      { label: "Tax Codes", href: "/dashboard/tax-codes", icon: ReceiptText, implemented: false },
      { label: "Account Mapping", href: "/dashboard/account-mapping", icon: Map, implemented: false },
      { label: "Integrations", href: "/dashboard/integrations", icon: Plug, implemented: false },
      { label: "Audit Logs", href: "/dashboard/audit-logs", icon: History, implemented: false },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, implemented: false },
    ],
  },
];
