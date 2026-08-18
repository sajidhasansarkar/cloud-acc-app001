import Link from "next/link";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getGeneralLedgerFilterOptions, listAccountLedger } from "@/accounting/general-ledger";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GeneralLedgerFilterBar } from "@/components/general-ledger/general-ledger-filter-bar";
import { GeneralLedgerPagination } from "@/components/general-ledger/general-ledger-pagination";
import { GeneralLedgerTable } from "@/components/general-ledger/general-ledger-table";
import { notFound } from "next/navigation";

export const metadata = { title: "Account Ledger — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: { companyId: string; accountId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const values = {
    accountId: params.accountId,
    dateFrom: typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : undefined,
    dateTo: typeof searchParams?.dateTo === "string" ? searchParams.dateTo : undefined,
    fiscalYearId: typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined,
    accountingPeriodId: typeof searchParams?.accountingPeriodId === "string" ? searchParams.accountingPeriodId : undefined,
  };
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const [options, ledger] = await Promise.all([
    getGeneralLedgerFilterOptions(organization.id, company.id),
    listAccountLedger(organization.id, company.id, params.accountId, {
      dateFrom: parseDate(values.dateFrom),
      dateTo: parseDate(values.dateTo, true),
      fiscalYearId: values.fiscalYearId,
      accountingPeriodId: values.accountingPeriodId,
      page,
    }),
  ]);

  if (!ledger) notFound();

  const query: Record<string, string> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => key !== "accountId" && Boolean(value)) as [string, string][]
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/companies/${company.id}/general-ledger`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to General Ledger
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">{ledger.account.code} — {ledger.account.name}</h1>
        <p className="text-sm text-ink-500">Account Ledger</p>
      </div>

      <GeneralLedgerFilterBar
        accounts={[ledger.account]}
        fiscalYears={options.fiscalYears}
        accountingPeriods={options.accountingPeriods}
        values={values}
        accountLocked
      />

      <Card>
        <CardHeader>
          <CardTitle>Account Ledger</CardTitle>
          <CardDescription>
            Running balance uses Decimal arithmetic and the Account type&apos;s existing normal-balance convention.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {ledger.total === 0 ? (
            <EmptyState icon={BookOpenCheck} title="No posted transactions available in the General Ledger." description="This account has no matching posted ledger records." className="m-4" />
          ) : (
            <>
              <div className="border-b border-ink-100 px-4 py-3 text-xs text-ink-500">
                Opening balance before this page: <span className="font-mono font-medium text-ink-800">{ledger.openingBalance.toFixed(4)}</span>
              </div>
              <GeneralLedgerTable companyId={company.id} entries={ledger.entries} showRunningBalance />
              <GeneralLedgerPagination {...ledger} query={query} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
