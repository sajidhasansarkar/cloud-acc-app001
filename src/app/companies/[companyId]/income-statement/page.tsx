import Link from "next/link";
import { ArrowUpRight, FileBarChart, Search } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { calculateIncomeStatement, getIncomeStatementFilterOptions } from "@/accounting/income-statement";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Income Statement — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const date = parseDate(value);
  return date?.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) ?? value;
}

function money(value: { toFixed: (scale: number) => string }, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}

function buildLedgerHref(
  companyId: string,
  accountId: string,
  values: { dateFrom: string; dateTo: string; fiscalYearId?: string; accountingPeriodId?: string }
) {
  const params = new URLSearchParams();
  params.set("dateFrom", values.dateFrom);
  params.set("dateTo", values.dateTo);
  if (values.fiscalYearId) params.set("fiscalYearId", values.fiscalYearId);
  if (values.accountingPeriodId) params.set("accountingPeriodId", values.accountingPeriodId);
  return `/companies/${companyId}/general-ledger/${accountId}?${params.toString()}`;
}

export default async function IncomeStatementPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const options = await getIncomeStatementFilterOptions(organization.id, company.id);

  const fiscalYearId = typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined;
  const accountingPeriodId = typeof searchParams?.accountingPeriodId === "string" ? searchParams.accountingPeriodId : undefined;
  const accountId = typeof searchParams?.accountId === "string" ? searchParams.accountId : undefined;
  const accountSearch = typeof searchParams?.accountSearch === "string" ? searchParams.accountSearch.trim() : undefined;
  const selectedFiscalYear = options.fiscalYears.find((year) => year.id === fiscalYearId);
  const selectedPeriod = options.accountingPeriods.find((period) => period.id === accountingPeriodId);

  const defaultFrom = selectedPeriod?.startDate ?? selectedFiscalYear?.startDate ?? options.fiscalYears[0]?.startDate ?? new Date();
  const defaultTo = selectedPeriod?.endDate ?? selectedFiscalYear?.endDate ?? options.fiscalYears[0]?.endDate ?? new Date();
  const dateFromValue = typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : iso(defaultFrom);
  const dateToValue = typeof searchParams?.dateTo === "string" ? searchParams.dateTo : iso(defaultTo);
  const dateFrom = parseDate(dateFromValue);
  const dateTo = parseDate(dateToValue, true);

  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    return <EmptyState icon={FileBarChart} title="Invalid report dates." description="Choose a valid From Date and To Date range." />;
  }

  const periods = fiscalYearId
    ? options.accountingPeriods.filter((period) => period.fiscalYearId === fiscalYearId)
    : options.accountingPeriods;

  const invalidPeriodSelection = Boolean(
    accountingPeriodId && (!selectedPeriod || (fiscalYearId && selectedPeriod.fiscalYearId !== fiscalYearId))
  );
  const invalidDateRange = Boolean(
    (selectedFiscalYear && (dateFrom < selectedFiscalYear.startDate || dateTo > selectedFiscalYear.endDate)) ||
    (selectedPeriod && (dateFrom < selectedPeriod.startDate || dateTo > selectedPeriod.endDate))
  );

  if (invalidPeriodSelection || invalidDateRange) {
    return (
      <div className="space-y-6">
        <ReportHeader companyName={company.displayName} currency={company.currency.toUpperCase()} from={dateFromValue} to={dateToValue} fiscalYearName={selectedFiscalYear?.name} />
        <FilterBar
          accounts={options.accounts}
          fiscalYears={options.fiscalYears}
          periods={periods}
          values={{ fiscalYearId, accountingPeriodId, accountId, accountSearch, dateFrom: dateFromValue, dateTo: dateToValue }}
        />
        <EmptyState
          icon={FileBarChart}
          title="Invalid reporting filters."
          description={invalidPeriodSelection ? "The selected Accounting Period must belong to the selected Fiscal Year and company." : "The reporting dates must fall within the selected Fiscal Year or Accounting Period."}
        />
      </div>
    );
  }

  const report = await calculateIncomeStatement(organization.id, company.id, {
    fiscalYearId,
    accountingPeriodId,
    dateFrom,
    dateTo,
    accountId,
    accountSearch,
  });

  if (!report) {
    return (
      <div className="space-y-6">
        <ReportHeader companyName={company.displayName} currency={company.currency.toUpperCase()} from={dateFromValue} to={dateToValue} fiscalYearName={selectedFiscalYear?.name} />
        <FilterBar
          accounts={options.accounts}
          fiscalYears={options.fiscalYears}
          periods={periods}
          values={{ fiscalYearId, accountingPeriodId, accountId, accountSearch, dateFrom: dateFromValue, dateTo: dateToValue }}
        />
        <EmptyState icon={FileBarChart} title="Unable to load Income Statement." description="The selected company or accounting filters are not available in the current organization." />
      </div>
    );
  }

  const hasActivity = report.revenueAccounts.length > 0 || report.expenseAccounts.length > 0;
  const currency = company.currency.toUpperCase();
  const ledgerContext = { dateFrom: dateFromValue, dateTo: dateToValue, fiscalYearId, accountingPeriodId };

  return (
    <div className="space-y-6">
      <ReportHeader companyName={company.displayName} currency={currency} from={dateFromValue} to={dateToValue} fiscalYearName={selectedFiscalYear?.name} />

      <FilterBar
        accounts={options.accounts}
        fiscalYears={options.fiscalYears}
        periods={periods}
        values={{ fiscalYearId, accountingPeriodId, accountId, accountSearch, dateFrom: dateFromValue, dateTo: dateToValue }}
      />

      {!hasActivity ? (
        <EmptyState
          icon={FileBarChart}
          title="No posted revenue or expense transactions available for this period."
          description="Only POSTED General Ledger records are included in the Income Statement."
        />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-ink-100 bg-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Income Statement</CardTitle>
                <CardDescription>{company.displayName} · {displayDate(dateFromValue)} to {displayDate(dateToValue)}</CardDescription>
              </div>
              <Badge variant={report.netIncome.gte(0) ? "success" : "danger"} className="w-fit">
                {report.netIncome.gte(0) ? "NET INCOME" : "NET LOSS"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <IncomeSection
              companyId={company.id}
              title="REVENUE"
              rows={report.revenueAccounts}
              total={report.totalRevenue}
              currency={currency}
              ledgerContext={ledgerContext}
            />
            <IncomeSection
              companyId={company.id}
              title="EXPENSES"
              rows={report.expenseAccounts}
              total={report.totalExpenses}
              currency={currency}
              ledgerContext={ledgerContext}
            />

            <div className="border-t border-ink-200 bg-surface-muted px-4 py-5 sm:px-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-sm font-semibold text-ink-900">Net Income / Loss</p>
                  <p className="text-xs text-ink-500">Total Revenue − Total Expenses</p>
                </div>
                <Badge variant={report.netIncome.gte(0) ? "success" : "danger"}>
                  {report.netIncome.gte(0) ? "NET INCOME" : "NET LOSS"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryMetric label="Total Revenue" value={money(report.totalRevenue, currency)} />
                <SummaryMetric label="Total Expenses" value={money(report.totalExpenses, currency)} />
                <SummaryMetric label={report.netIncome.gte(0) ? "Net Income" : "Net Loss"} value={money(report.netIncome.abs(), currency)} emphasis />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type AccountOption = { id: string; code: string; name: string; type: "REVENUE" | "EXPENSE" };
type FiscalYearOption = { id: string; name: string; startDate: Date; endDate: Date };
type PeriodOption = { id: string; fiscalYearId: string; name: string; startDate: Date; endDate: Date };

type FilterValues = {
  dateFrom: string;
  dateTo: string;
  fiscalYearId?: string;
  accountingPeriodId?: string;
  accountId?: string;
  accountSearch?: string;
};

function FilterBar({ accounts, fiscalYears, periods, values }: { accounts: AccountOption[]; fiscalYears: FiscalYearOption[]; periods: PeriodOption[]; values: FilterValues }) {
  return (
    <form method="get" className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">From Date</span><Input name="dateFrom" type="date" required defaultValue={values.dateFrom} min={values.fiscalYearId ? iso(fiscalYears.find((year) => year.id === values.fiscalYearId)?.startDate ?? new Date("1900-01-01")) : undefined} max={values.fiscalYearId ? iso(fiscalYears.find((year) => year.id === values.fiscalYearId)?.endDate ?? new Date("2999-12-31")) : undefined} /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">To Date</span><Input name="dateTo" type="date" required defaultValue={values.dateTo} min={values.fiscalYearId ? iso(fiscalYears.find((year) => year.id === values.fiscalYearId)?.startDate ?? new Date("1900-01-01")) : undefined} max={values.fiscalYearId ? iso(fiscalYears.find((year) => year.id === values.fiscalYearId)?.endDate ?? new Date("2999-12-31")) : undefined} /></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Fiscal Year</span><Select name="fiscalYearId" defaultValue={values.fiscalYearId ?? ""}><option value="">All fiscal years</option>{fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Accounting Period</span><Select name="accountingPeriodId" defaultValue={values.accountingPeriodId ?? ""}><option value="">All periods</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</Select></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Account</span><Select name="accountId" defaultValue={values.accountId ?? ""}><option value="">All revenue &amp; expense accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</Select></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-ink-600">Account Search</span><Input name="accountSearch" defaultValue={values.accountSearch} placeholder="Code or account name" /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm"><Search className="h-3.5 w-3.5" /> Apply filters</Button>
        <Link href="?" className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-500 hover:bg-surface-muted hover:text-ink-800">Clear</Link>
      </div>
    </form>
  );
}

function IncomeSection({ companyId, title, rows, total, currency, ledgerContext }: {
  companyId: string;
  title: string;
  rows: { account: { id: string; code: string; name: string }; amount: { toFixed: (scale: number) => string } }[];
  total: { toFixed: (scale: number) => string };
  currency: string;
  ledgerContext: { dateFrom: string; dateTo: string; fiscalYearId?: string; accountingPeriodId?: string };
}) {
  return (
    <section className="border-b border-ink-100 last:border-b-0">
      <div className="border-b border-ink-100 bg-surface-muted px-4 py-3 text-xs font-semibold tracking-[0.12em] text-ink-700 sm:px-6">{title}</div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[7rem_1fr_auto] gap-3 border-b border-ink-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:px-6">
            <span>Account Code</span><span>Account Name</span><span className="text-right">Amount</span>
          </div>
          <div className="divide-y divide-ink-50">
            {rows.map((row) => (
              <Link
                key={row.account.id}
                href={buildLedgerHref(companyId, row.account.id, ledgerContext)}
                className="grid grid-cols-[7rem_1fr_auto] gap-3 px-4 py-3 text-sm transition hover:bg-surface-muted sm:px-6"
              >
                <span className="font-mono text-ink-500">{row.account.code}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-ink-800">
                  <span className="truncate">{row.account.name}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                </span>
                <span className="font-mono tabular-nums text-ink-900">{money(row.amount, currency)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm font-semibold sm:px-6">
        <span>Total {title === "REVENUE" ? "Revenue" : "Expenses"}</span>
        <span className="font-mono tabular-nums">{money(total, currency)}</span>
      </div>
    </section>
  );
}

function ReportHeader({ companyName, currency, from, to, fiscalYearName }: { companyName: string; currency: string; from: string; to: string; fiscalYearName?: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ledger-600">Financial Report</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-900">Income Statement</h1>
        <p className="mt-1 text-sm text-ink-500">{companyName} · {displayDate(from)} to {displayDate(to)}</p>
        {fiscalYearName ? <p className="mt-0.5 text-xs text-ink-400">Fiscal Year: {fiscalYearName}</p> : null}
      </div>
      <div className="rounded-md border border-ink-100 bg-white px-3 py-2 text-right shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Reporting Currency</p>
        <p className="mt-0.5 font-mono text-sm font-semibold text-ink-800">{currency}</p>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border px-4 py-3 ${emphasis ? "border-ledger-200 bg-white shadow-sm" : "border-ink-100 bg-white"}`}>
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${emphasis ? "text-ink-900" : "text-ink-800"}`}>{value}</p>
    </div>
  );
}
