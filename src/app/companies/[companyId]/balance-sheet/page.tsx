import { Scale, ShieldCheck } from "lucide-react";
import { requireOwnedCompany } from "@/lib/company-guard";
import { requireActiveOrganization } from "@/lib/session";
import { getBalanceSheet, getBalanceSheetFilterOptions } from "@/accounting/balance-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BalanceSheetFilterBar } from "@/components/balance-sheet/balance-sheet-filter-bar";
import { BalanceSheetSection } from "@/components/balance-sheet/balance-sheet-section";

export const metadata = { title: "Balance Sheet — Ledger" };

function parseDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatMoney(value: string, currency: string) {
  return `${currency} ${value}`;
}

export default async function CompanyBalanceSheetPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const options = await getBalanceSheetFilterOptions(organization.id, company.id);

  const selectedFiscalYearId = typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined;
  const selectedFiscalYear = options.fiscalYears.find((year) => year.id === selectedFiscalYearId);
  const requestedAsOf = typeof searchParams?.asOfDate === "string" ? parseDate(searchParams.asOfDate) : undefined;
  const today = new Date();
  const asOfDate = requestedAsOf ?? (
    selectedFiscalYear
      ? today < selectedFiscalYear.startDate
        ? selectedFiscalYear.endDate
        : today > selectedFiscalYear.endDate
          ? selectedFiscalYear.endDate
          : today
      : today
  );
  const asOfDateValue = formatDate(asOfDate);
  const accountId = typeof searchParams?.accountId === "string" ? searchParams.accountId : undefined;
  const accountSearch = typeof searchParams?.accountSearch === "string" ? searchParams.accountSearch.trim() : undefined;

  const invalidDateForFiscalYear = Boolean(
    selectedFiscalYear && (asOfDate < selectedFiscalYear.startDate || asOfDate > selectedFiscalYear.endDate)
  );

  const values = {
    asOfDate: asOfDateValue,
    fiscalYearId: selectedFiscalYearId,
    accountId,
    accountSearch,
  };

  if (invalidDateForFiscalYear) {
    return (
      <div className="space-y-6">
        <ReportHeader companyName={company.displayName} currency={company.currency} asOfDate={asOfDate} />
        <BalanceSheetFilterBar accounts={options.accounts} fiscalYears={options.fiscalYears} values={values} />
        <EmptyState
          icon={Scale}
          title="Invalid report date"
          description={`The As of Date must fall within ${selectedFiscalYear?.name ?? "the selected fiscal year"}.`}
        />
      </div>
    );
  }

  const report = await getBalanceSheet(organization.id, company.id, {
    fiscalYearId: values.fiscalYearId,
    asOfDate,
    accountId: values.accountId,
    accountSearch: values.accountSearch,
  });

  if (!report) {
    return (
      <div className="space-y-6">
        <ReportHeader companyName={company.displayName} currency={company.currency} asOfDate={asOfDate} />
        <BalanceSheetFilterBar accounts={options.accounts} fiscalYears={options.fiscalYears} values={values} />
        <EmptyState
          icon={ShieldCheck}
          title="Unable to load Balance Sheet."
          description="The selected company, fiscal year, or account is not available in the current organization."
        />
      </div>
    );
  }

  const totalLiabilitiesAndEquity = report.totalLiabilities.plus(report.totalEquity);
  const currency = company.currency.toUpperCase();

  return (
    <div className="space-y-6">
      <ReportHeader companyName={company.displayName} currency={currency} asOfDate={asOfDate} />

      <BalanceSheetFilterBar accounts={options.accounts} fiscalYears={options.fiscalYears} values={values} />

      {report.rows.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No posted accounting transactions available for this report."
          description="Only POSTED General Ledger records are included in the Balance Sheet."
        />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-ink-100 bg-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>{company.displayName} · As of {formatDisplayDate(asOfDate)}</CardDescription>
              </div>
              <Badge variant={report.balanced ? "success" : "danger"} className="w-fit">
                {report.balanced ? "BALANCED" : "OUT OF BALANCE"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <BalanceSheetSection companyId={company.id} title="ASSETS" rows={report.sections.ASSET} total={report.totalAssets} asOfDate={values.asOfDate} currency={currency} />
            <BalanceSheetSection companyId={company.id} title="LIABILITIES" rows={report.sections.LIABILITY} total={report.totalLiabilities} asOfDate={values.asOfDate} currency={currency} />
            <BalanceSheetSection companyId={company.id} title="EQUITY" rows={report.sections.EQUITY} total={report.totalEquity} asOfDate={values.asOfDate} currency={currency} />

            <div className="border-t border-ink-200 bg-surface-muted px-4 py-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-ink-900">Accounting Equation</h2>
                  <p className="text-xs text-ink-500">Assets = Liabilities + Equity</p>
                </div>
                <Badge variant={report.balanced ? "success" : "danger"}>
                  {report.balanced ? "BALANCED" : "OUT OF BALANCE"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryMetric label="Total Assets" value={formatMoney(report.totalAssets.toFixed(2), currency)} />
                <SummaryMetric label="Total Liabilities" value={formatMoney(report.totalLiabilities.toFixed(2), currency)} />
                <SummaryMetric label="Total Equity" value={formatMoney(report.totalEquity.toFixed(2), currency)} />
                <SummaryMetric label="Liabilities + Equity" value={formatMoney(totalLiabilitiesAndEquity.toFixed(2), currency)} />
              </div>

              <div className="mt-3 flex flex-col gap-2 rounded-md border border-ink-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-ink-700">Difference</span>
                <span className={`font-mono text-sm font-semibold tabular-nums ${report.balanced ? "text-positive" : "text-negative"}`}>
                  {formatMoney(report.difference.toFixed(2), currency)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportHeader({ companyName, currency, asOfDate }: { companyName: string; currency: string; asOfDate: Date }) {
  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ledger-600">Financial Report</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-900">Balance Sheet</h1>
        <p className="mt-1 text-sm text-ink-500">{companyName} · As of {formatDisplayDate(asOfDate)}</p>
      </div>
      <div className="rounded-md border border-ink-100 bg-white px-3 py-2 text-right shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Reporting Currency</p>
        <p className="mt-0.5 font-mono text-sm font-semibold text-ink-800">{currency}</p>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-100 bg-white px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}
