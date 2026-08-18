import { Scale } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getTrialBalanceFilterOptions, listTrialBalance } from "@/accounting/trial-balance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TrialBalanceFilterBar } from "@/components/trial-balance/trial-balance-filter-bar";
import { TrialBalancePagination } from "@/components/trial-balance/trial-balance-pagination";
import { TrialBalanceTable } from "@/components/trial-balance/trial-balance-table";

export const metadata = { title: "Trial Balance — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function CompanyTrialBalancePage({
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

  const [options, trialBalance] = await Promise.all([
    getTrialBalanceFilterOptions(organization.id, company.id),
    listTrialBalance(organization.id, company.id, {
      ...values,
      dateFrom: parseDate(values.dateFrom),
      dateTo: parseDate(values.dateTo, true),
      page,
    }),
  ]);

  if (!trialBalance) {
    return (
      <EmptyState
        icon={Scale}
        title="Unable to load Trial Balance."
        description="The selected company or accounting filters are not available in the current organization."
      />
    );
  }

  const query: Record<string, string> = Object.fromEntries(
    Object.entries(values).filter(([, value]) => Boolean(value)) as [string, string][]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Trial Balance</h1>
        <p className="text-sm text-ink-500">Aggregated from POSTED General Ledger records only.</p>
      </div>

      <TrialBalanceFilterBar
        accounts={options.accounts}
        fiscalYears={options.fiscalYears}
        accountingPeriods={options.accountingPeriods}
        values={values}
      />

      {trialBalance.accountCount === 0 ? (
        <EmptyState
          icon={Scale}
          title="No posted accounting transactions available."
          description="Only POSTED Journal Entries projected into the General Ledger are included in Trial Balance."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Trial Balance</CardTitle>
            <CardDescription>{trialBalance.accountCount} account{trialBalance.accountCount === 1 ? "" : "s"} with posted activity.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <TrialBalanceTable companyId={company.id} rows={trialBalance.rows} />
            <div className="grid grid-cols-1 gap-3 border-t border-ink-100 bg-surface-muted p-4 text-sm md:grid-cols-3">
              <div><span className="text-ink-500">Total Debit</span><div className="font-mono font-semibold text-ink-900">{trialBalance.totalDebit.toFixed(4)}</div></div>
              <div><span className="text-ink-500">Total Credit</span><div className="font-mono font-semibold text-ink-900">{trialBalance.totalCredit.toFixed(4)}</div></div>
              <div><span className="text-ink-500">Difference</span><div className="font-mono font-semibold text-ink-900">{trialBalance.difference.toFixed(4)}</div></div>
            </div>
            <div className={`border-t px-4 py-3 text-sm font-semibold ${trialBalance.balanced ? "text-ledger-700" : "text-red-700"}`}>
              {trialBalance.balanced ? "TRIAL BALANCE BALANCED" : "TRIAL BALANCE OUT OF BALANCE"}
            </div>
            <TrialBalancePagination {...trialBalance} query={query} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
