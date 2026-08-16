import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, CalendarRange } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getOwnedFiscalYear } from "@/accounting/access";
import { listAccountingPeriods } from "@/accounting/accounting-periods";
import { canManageFiscalYears } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { FiscalYearStatusAction } from "@/components/fiscal-years/fiscal-year-status-action";
import { GeneratePeriodsDialog } from "@/components/fiscal-years/generate-periods-dialog";
import { PeriodTable } from "@/components/fiscal-years/period-table";

export const metadata = { title: "Fiscal Year — Ledger" };

function statusBadgeVariant(status: string) {
  if (status === "OPEN") return "success" as const;
  if (status === "LOCKED") return "danger" as const;
  return "outline" as const; // CLOSED
}

export default async function FiscalYearDetailPage({
  params,
}: {
  params: { companyId: string; fiscalYearId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/settings/fiscal-period`;

  // Ownership chain re-verified here too: fiscalYearId from the URL must
  // belong to companyId, which must belong to the caller's organization.
  const fiscalYear = await getOwnedFiscalYear(organization.id, company.id, params.fiscalYearId);
  if (!fiscalYear) {
    notFound();
  }

  const periods = (await listAccountingPeriods(organization.id, company.id, fiscalYear.id)) ?? [];
  const canManage = canManageFiscalYears(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to fiscal periods
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">{fiscalYear.name}</h1>
            <Badge variant={statusBadgeVariant(fiscalYear.status)}>{fiscalYear.status}</Badge>
          </div>
          <p className="text-sm text-ink-500">
            {formatDate(fiscalYear.startDate)} – {formatDate(fiscalYear.endDate)}
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${basePath}/${fiscalYear.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <GeneratePeriodsDialog
              companyId={company.id}
              fiscalYearId={fiscalYear.id}
              disabled={periods.length > 0}
              defaultFrequency={company.defaultPeriodFrequency}
            />
            <FiscalYearStatusAction
              companyId={company.id}
              fiscalYearId={fiscalYear.id}
              fiscalYearName={fiscalYear.name}
              status={fiscalYear.status}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-ink-500">Start Date</p>
            <p className="text-sm font-medium text-ink-900">{formatDate(fiscalYear.startDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-ink-500">End Date</p>
            <p className="text-sm font-medium text-ink-900">{formatDate(fiscalYear.endDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-ink-500">Accounting Periods</p>
            <p className="text-sm font-medium text-ink-900">{periods.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounting Periods</CardTitle>
          <CardDescription>
            {periods.length > 0
              ? "Generated from this fiscal year's own start date — Period 1 always begins there."
              : "No periods yet. Use Generate Periods above to create them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No accounting periods"
              description="Generate monthly or quarterly periods for this fiscal year."
            />
          ) : (
            <PeriodTable companyId={company.id} periods={periods} canManage={canManage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
