import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canManageCompanies } from "@/lib/rbac";
import { requireActiveOrganization } from "@/lib/session";
import { getCurrentFiscalYear } from "@/accounting/fiscal-years";
import { SettingsTabs } from "@/components/companies/settings-tabs";
import { AccountingSettingsForm } from "@/components/companies/accounting-settings-form";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Accounting Settings — Ledger" };

function statusBadgeVariant(status: string) {
  if (status === "OPEN") return "success" as const;
  if (status === "LOCKED") return "danger" as const;
  return "outline" as const; // CLOSED
}

export default async function CompanyAccountingSettingsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  // Security gate: Authenticated User -> Organization -> Company, re-derived
  // here rather than trusted from the URL.
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageCompanies(role);

  // Reuses the existing Phase 2B-1 lookup — no new fiscal-year logic here.
  const currentFiscalYear = await getCurrentFiscalYear(organization.id, company.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Company Settings</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>

      <SettingsTabs companyId={company.id} />

      <Card>
        <CardHeader>
          <CardTitle>Accounting</CardTitle>
          <CardDescription>Fiscal year status and period-generation defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label>Fiscal Year</Label>
            {currentFiscalYear ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink-900">{currentFiscalYear.name}</p>
                <Badge variant={statusBadgeVariant(currentFiscalYear.status)}>
                  {currentFiscalYear.status}
                </Badge>
                <span className="text-xs text-ink-500">
                  {formatDate(currentFiscalYear.startDate)} – {formatDate(currentFiscalYear.endDate)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                No active fiscal year. Manage fiscal years from the Fiscal Period tab.
              </p>
            )}
          </div>

          <div className="border-t border-ink-100 pt-6">
            <AccountingSettingsForm
              companyId={company.id}
              defaultPeriodFrequency={company.defaultPeriodFrequency}
              canManage={canManage}
            />
          </div>

          <div className="border-t border-ink-100 pt-6">
            <Link
              href={`/companies/${company.id}/settings/fiscal-period`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarRange className="h-4 w-4" />
              Manage Fiscal Years & Periods
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
