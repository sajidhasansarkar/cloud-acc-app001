import { Scale } from "lucide-react";
import { requireOwnedCompany } from "@/lib/company-guard";
import { requireActiveOrganization } from "@/lib/session";
import { getBalanceSheet, getBalanceSheetFilterOptions } from "@/accounting/balance-sheet";
import { EmptyState } from "@/components/ui/empty-state";
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
  const values = {
    asOfDate: formatDate(asOfDate),
    fiscalYearId: selectedFiscalYearId,
    accountId: typeof searchParams?.accountId === "string" ? searchParams.accountId : undefined,
    accountSearch: typeof searchParams?.accountSearch === "string" ? searchParams.accountSearch : undefined,
  };

  const report = await getBalanceSheet(organization.id, company.id, {
    fiscalYearId: values.fiscalYearId,
    asOfDate,
    accountId: values.accountId,
    accountSearch: values.accountSearch,
  });

  if (!report) {
    return <EmptyState icon={Scale} title="Unable to load Balance Sheet." description="The selected company, fiscal year, or account is not available in the current organization." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Balance Sheet</h1>
        <p className="text-sm text-ink-500">{company.displayName} · As of {values.asOfDate}</p>
      </div>

      <BalanceSheetFilterBar accounts={options.accounts} fiscalYears={options.fiscalYears} values={values} />

      {report.rows.length === 0 ? (
        <EmptyState icon={Scale} title="No posted accounting transactions available for this report." description="Only POSTED General Ledger records are included in the Balance Sheet." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Balance Sheet</CardTitle>
            <CardDescription>{company.displayName} · As of {values.asOfDate}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BalanceSheetSection companyId={company.id} title="ASSETS" rows={report.sections.ASSET} total={report.totalAssets} asOfDate={values.asOfDate} />
            <BalanceSheetSection companyId={company.id} title="LIABILITIES" rows={report.sections.LIABILITY} total={report.totalLiabilities} asOfDate={values.asOfDate} />
            <BalanceSheetSection companyId={company.id} title="EQUITY" rows={report.sections.EQUITY} total={report.totalEquity} asOfDate={values.asOfDate} />

            <div className="grid grid-cols-1 gap-3 border-t border-ink-100 bg-surface-muted p-4 text-sm md:grid-cols-3">
              <div><span className="text-ink-500">Total Assets</span><div className="font-mono font-semibold text-ink-900">{report.totalAssets.toFixed(4)}</div></div>
              <div><span className="text-ink-500">Total Liabilities</span><div className="font-mono font-semibold text-ink-900">{report.totalLiabilities.toFixed(4)}</div></div>
              <div><span className="text-ink-500">Total Equity</span><div className="font-mono font-semibold text-ink-900">{report.totalEquity.toFixed(4)}</div></div>
            </div>
            <div className="border-t border-ink-100 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink-700">Difference</span>
                <span className="font-mono font-semibold text-ink-900">{report.difference.toFixed(4)}</span>
              </div>
              <div className={`mt-2 font-semibold ${report.balanced ? "text-ledger-700" : "text-red-700"}`}>
                {report.balanced ? "BALANCE SHEET BALANCED" : "BALANCE SHEET OUT OF BALANCE"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
