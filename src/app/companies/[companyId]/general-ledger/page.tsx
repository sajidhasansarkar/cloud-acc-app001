import { BookOpenCheck } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getGeneralLedgerFilterOptions, listGeneralLedger } from "@/accounting/general-ledger";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GeneralLedgerFilterBar } from "@/components/general-ledger/general-ledger-filter-bar";
import { GeneralLedgerPagination } from "@/components/general-ledger/general-ledger-pagination";
import { GeneralLedgerTable } from "@/components/general-ledger/general-ledger-table";

export const metadata = { title: "General Ledger — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const values = {
    accountId: typeof searchParams?.accountId === "string" ? searchParams.accountId : undefined,
    accountSearch: typeof searchParams?.accountSearch === "string" ? searchParams.accountSearch : undefined,
    dateFrom: typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : undefined,
    dateTo: typeof searchParams?.dateTo === "string" ? searchParams.dateTo : undefined,
    fiscalYearId: typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined,
    accountingPeriodId: typeof searchParams?.accountingPeriodId === "string" ? searchParams.accountingPeriodId : undefined,
  };
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const [options, ledger] = await Promise.all([
    getGeneralLedgerFilterOptions(organization.id, company.id),
    listGeneralLedger(organization.id, company.id, {
      ...values,
      dateFrom: parseDate(values.dateFrom),
      dateTo: parseDate(values.dateTo, true),
      page,
    }),
  ]);

  const query: Record<string, string> = Object.fromEntries(
    Object.entries(values).filter(([, value]) => Boolean(value)) as [string, string][]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">General Ledger</h1>
        <p className="text-sm text-ink-500">Posted Journal Entries are projected here one Journal Line at a time.</p>
      </div>

      <GeneralLedgerFilterBar
        accounts={options.accounts}
        fiscalYears={options.fiscalYears}
        accountingPeriods={options.accountingPeriods}
        values={values}
      />

      {ledger.total === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No posted transactions available in the General Ledger."
          description="Only POSTED Journal Entries create General Ledger records."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ledger Activity</CardTitle>
            <CardDescription>{ledger.total} posted ledger record{ledger.total === 1 ? "" : "s"} in this company.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <GeneralLedgerTable companyId={company.id} entries={ledger.entries} />
            <GeneralLedgerPagination {...ledger} query={query} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
