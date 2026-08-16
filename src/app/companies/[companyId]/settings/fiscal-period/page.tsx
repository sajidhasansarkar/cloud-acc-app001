import Link from "next/link";
import { Plus, CalendarRange, Eye, Pencil } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listFiscalYears, getCurrentFiscalYear } from "@/accounting/fiscal-years";
import { getCurrentAccountingPeriod } from "@/accounting/accounting-periods";
import { canManageFiscalYears } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Fiscal Period — Ledger" };

function statusBadgeVariant(status: string) {
  if (status === "OPEN") return "success" as const;
  if (status === "LOCKED") return "danger" as const;
  return "outline" as const; // CLOSED
}

export default async function FiscalPeriodPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role, organization } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);

  const [fiscalYears, currentFiscalYear, currentPeriod] = await Promise.all([
    listFiscalYears(organization.id, company.id),
    getCurrentFiscalYear(organization.id, company.id),
    getCurrentAccountingPeriod(organization.id, company.id),
  ]);

  const canManage = canManageFiscalYears(role);
  const basePath = `/companies/${company.id}/settings/fiscal-period`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Fiscal Period</h1>
          <p className="text-sm text-ink-500">
            Fiscal years and accounting periods for {company.displayName}.
          </p>
        </div>
        {canManage ? (
          <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" />
            Create Fiscal Year
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Fiscal Year</CardTitle>
          </CardHeader>
          <CardContent>
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
              <p className="text-sm text-ink-500">No active fiscal year configured.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current Accounting Period</CardTitle>
          </CardHeader>
          <CardContent>
            {currentPeriod ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink-900">{currentPeriod.name}</p>
                <Badge variant={statusBadgeVariant(currentPeriod.status)}>{currentPeriod.status}</Badge>
                <span className="text-xs text-ink-500">
                  {formatDate(currentPeriod.startDate)} – {formatDate(currentPeriod.endDate)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No active accounting period configured.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        {!fiscalYears || fiscalYears.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarRange}
              title="No fiscal years yet"
              description="Create your first fiscal year to start generating accounting periods."
              action={
                canManage ? (
                  <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    <Plus className="h-4 w-4" />
                    Create fiscal year
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fiscal Year Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Periods</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiscalYears.map((fy) => (
                <TableRow key={fy.id}>
                  <TableCell className="font-medium">
                    <Link href={`${basePath}/${fy.id}`} className="hover:text-ledger-600">
                      {fy.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-500">{formatDate(fy.startDate)}</TableCell>
                  <TableCell className="text-ink-500">{formatDate(fy.endDate)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(fy.status)}>{fy.status}</Badge>
                  </TableCell>
                  <TableCell className="text-ink-500">{fy._count.accountingPeriods}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`${basePath}/${fy.id}`}
                        title="View"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View</span>
                      </Link>
                      {canManage ? (
                        <Link
                          href={`${basePath}/${fy.id}/edit`}
                          title="Edit"
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
