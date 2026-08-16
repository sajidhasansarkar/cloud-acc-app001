import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Globe,
  Coins,
  Hash,
  Mail,
  Phone,
  CalendarRange,
  ArrowLeftRight,
  BookText,
  ListTree,
  BookOpenCheck,
  Scale,
  FileBarChart,
  ListChecks,
  Bot,
} from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCurrentFiscalYear } from "@/accounting/fiscal-years";
import { getCurrentAccountingPeriod } from "@/accounting/accounting-periods";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { COMPANY_STATUS_LABELS } from "@/lib/constants";

function statusBadgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "ARCHIVED") return "outline" as const;
  return "warning" as const;
}

function periodStatusBadgeVariant(status: string) {
  if (status === "OPEN") return "success" as const;
  if (status === "LOCKED") return "danger" as const;
  return "outline" as const; // CLOSED
}

const FUTURE_MODULES = [
  { label: "Transactions", segment: "transactions", icon: ArrowLeftRight },
  { label: "Journal Entries", segment: "journal-entries", icon: BookText },
  { label: "Chart of Accounts", segment: "chart-of-accounts", icon: ListTree },
  { label: "General Ledger", segment: "general-ledger", icon: BookOpenCheck },
  { label: "Trial Balance", segment: "trial-balance", icon: Scale },
  { label: "Reports", segment: "reports", icon: FileBarChart },
  { label: "Bank Reconciliation", segment: "bank-reconciliation", icon: ListChecks },
  { label: "AI Assistant", segment: "ai-assistant", icon: Bot },
];

export default async function CompanyOverviewPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { organization } = await requireActiveOrganization();

  // Independent re-check of Organization -> Company ownership for this page's
  // own data fetch (the layout already gated the route, but this query is
  // what actually decides what's shown, so it scopes itself the same way the
  // Phase 2A company detail page does).
  const company = await prisma.company.findFirst({
    where: { id: params.companyId, organizationId: organization.id },
    include: { countryConfiguration: true },
  });

  if (!company) {
    notFound();
  }

  // Reused as-is from Phase 2B-1 — no fiscal logic is duplicated here.
  const [fiscalYear, accountingPeriod] = await Promise.all([
    getCurrentFiscalYear(organization.id, company.id),
    getCurrentAccountingPeriod(organization.id, company.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-ink-900">{company.displayName}</h1>
          <Badge variant={statusBadgeVariant(company.status)}>{COMPANY_STATUS_LABELS[company.status]}</Badge>
        </div>
        <p className="text-sm text-ink-500">{company.legalName}</p>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Core identity and contact details on file for this company.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="Legal Name" value={company.legalName} />
            <InfoField label="Display Name" value={company.displayName} />
            <InfoField
              icon={Globe}
              label="Country"
              value={company.countryConfiguration?.countryName ?? company.country}
            />
            <InfoField
              icon={Coins}
              label="Currency"
              value={`${company.countryConfiguration?.currencySymbol ?? ""} ${company.currency}`.trim()}
            />
            <InfoField icon={Hash} label="Business Number" value={company.businessNumber} />
            <InfoField
              label="Status"
              value={undefined}
              customValue={<Badge variant={statusBadgeVariant(company.status)}>{COMPANY_STATUS_LABELS[company.status]}</Badge>}
            />
            <InfoField icon={Mail} label="Contact Email" value={company.contactEmail} />
            <InfoField icon={Phone} label="Contact Phone" value={company.contactPhone} />
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Information */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Fiscal Information</CardTitle>
            <CardDescription>Derived from this company&apos;s fiscal calendar — nothing here is invented.</CardDescription>
          </div>
          <Link
            href={`/companies/${company.id}/settings/fiscal-period`}
            className="shrink-0 text-xs font-medium text-ledger-600 hover:underline"
          >
            Manage fiscal periods
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-ink-100 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
                <CalendarRange className="h-3.5 w-3.5" />
                Current Fiscal Year
              </p>
              {fiscalYear ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm font-semibold text-ink-900">{fiscalYear.name}</p>
                    <Badge variant={periodStatusBadgeVariant(fiscalYear.status)}>{fiscalYear.status}</Badge>
                  </div>
                  <p className="text-sm text-ink-500">
                    {formatDate(fiscalYear.startDate)} – {formatDate(fiscalYear.endDate)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-500">No active fiscal year configured.</p>
              )}
            </div>

            <div className="rounded-md border border-ink-100 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
                <CalendarRange className="h-3.5 w-3.5" />
                Current Accounting Period
              </p>
              {accountingPeriod ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm font-semibold text-ink-900">{accountingPeriod.name}</p>
                    <Badge variant={periodStatusBadgeVariant(accountingPeriod.status)}>
                      {accountingPeriod.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-500">
                    {formatDate(accountingPeriod.startDate)} – {formatDate(accountingPeriod.endDate)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-500">No active accounting period configured.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Future Modules */}
      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink-900">Future Modules</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FUTURE_MODULES.map((mod) => (
            <Card key={mod.segment} className="opacity-90">
              <CardContent className="flex flex-col gap-2 py-4">
                <mod.icon className="h-4 w-4 text-ink-400" />
                <p className="text-sm font-medium text-ink-900">{mod.label}</p>
                <p className="text-xs text-ink-500">Available in a future phase.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
  customValue,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  customValue?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> : null}
      <div>
        <p className="text-xs text-ink-500">{label}</p>
        {customValue ?? <p className="text-sm font-medium text-ink-900">{value || "—"}</p>}
      </div>
    </div>
  );
}
