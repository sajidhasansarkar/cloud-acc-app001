import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { calculateCashFlow, getCashFlowFilterOptions } from "@/accounting/cash-flow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Cash Flow — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function money(v: { toFixed(scale: number): string }, currency: string) { return `${currency} ${v.toFixed(2)}`; }

export default async function CashFlowPage({ params, searchParams }: { params: { companyId: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const options = await getCashFlowFilterOptions(organization.id, company.id);
  const fiscalYearId = typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined;
  const accountingPeriodId = typeof searchParams?.accountingPeriodId === "string" ? searchParams.accountingPeriodId : undefined;
  const fy = options.fiscalYears.find((x) => x.id === fiscalYearId);
  const period = options.accountingPeriods.find((x) => x.id === accountingPeriodId);
  const fromValue = typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : iso(period?.startDate ?? fy?.startDate ?? options.fiscalYears[0]?.startDate ?? new Date());
  const toValue = typeof searchParams?.dateTo === "string" ? searchParams.dateTo : iso(period?.endDate ?? fy?.endDate ?? options.fiscalYears[0]?.endDate ?? new Date());
  const dateFrom = parseDate(fromValue);
  const dateTo = parseDate(toValue, true);
  const periods = fiscalYearId ? options.accountingPeriods.filter((x) => x.fiscalYearId === fiscalYearId) : options.accountingPeriods;

  if (!dateFrom || !dateTo || dateFrom > dateTo || (fy && (dateFrom < fy.startDate || dateTo > fy.endDate)) || (period && (dateFrom < period.startDate || dateTo > period.endDate)) || (period && fiscalYearId && period.fiscalYearId !== fiscalYearId)) {
    return <EmptyState icon={FileBarChart} title="Invalid Cash Flow filters." description="Choose a valid date range, Fiscal Year and Accounting Period." />;
  }

  const report = await calculateCashFlow(organization.id, company.id, { fiscalYearId, accountingPeriodId, dateFrom, dateTo });
  if (!report) return <EmptyState icon={FileBarChart} title="Unable to load Cash Flow." description="The selected company or accounting filters are not available in the current organization." />;
  const hasActivity = report.operatingActivities.length + report.investingActivities.length + report.financingActivities.length + report.unclassifiedActivities.length > 0;
  const currency = company.currency.toUpperCase();
  const reconciled = report.beginningCash.plus(report.netChangeInCash).eq(report.endingCash);
  const query = new URLSearchParams();
  if (fiscalYearId) query.set("fiscalYearId", fiscalYearId);
  if (accountingPeriodId) query.set("accountingPeriodId", accountingPeriodId);
  query.set("dateFrom", fromValue); query.set("dateTo", toValue);

  const rows = (title: string, items: typeof report.operatingActivities) => <section className="border-t border-ink-100 px-4 py-5 sm:px-6"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-semibold text-ink-900">{title}</h2><span className="text-xs text-ink-500">{items.length} movement{items.length === 1 ? "" : "s"}</span></div>{items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-500"><th className="pb-2 pr-4">Account</th><th className="pb-2 pr-4">Journal Entry</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Description</th><th className="pb-2 text-right">Amount</th></tr></thead><tbody>{items.map((item, i) => <tr key={`${item.journalEntryId}-${item.accountId}-${i}`} className="border-b border-ink-50"><td className="py-2 pr-4"><Link href={`${`/companies/${company.id}/general-ledger/${item.accountId}?dateTo=${toValue}`}`} className="font-medium text-ledger-700 hover:underline">{item.accountCode} · {item.accountName}</Link></td><td className="py-2 pr-4 text-ink-500">{item.entryNumber}</td><td className="py-2 pr-4 text-ink-500">{iso(item.entryDate)}</td><td className="py-2 pr-4 text-ink-700">{item.description ?? "—"}</td><td className="py-2 text-right font-medium tabular-nums">{money(item.amount, currency)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-ink-500">No classified cash movements.</p>}</section>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="font-display text-xl font-semibold text-ink-900">{company.displayName}</h1><p className="text-sm text-ink-500">Cash Flow Statement</p></div>
    <Card>
      <CardHeader><CardTitle>Reporting period</CardTitle></CardHeader>
      <CardContent>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-ink-600">From Date<input name="dateFrom" type="date" defaultValue={fromValue} className="mt-1 block w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs font-medium text-ink-600">To Date<input name="dateTo" type="date" defaultValue={toValue} className="mt-1 block w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm" /></label>
          <label className="text-xs font-medium text-ink-600">Fiscal Year<select name="fiscalYearId" defaultValue={fiscalYearId ?? ""} className="mt-1 block w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">All fiscal years</option>{options.fiscalYears.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="text-xs font-medium text-ink-600">Accounting Period<select name="accountingPeriodId" defaultValue={accountingPeriodId ?? ""} className="mt-1 block w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"><option value="">All periods</option>{periods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <div className="flex items-end"><button className="w-full rounded bg-ink-900 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800">Apply filters</button></div>
        </form>
      </CardContent>
    </Card>
    <Card><CardContent className="p-0">
      {!hasActivity ? <div className="p-6"><EmptyState icon={FileBarChart} title="No posted cash flow transactions available for this period." description="Only POSTED Cash/Bank General Ledger movements are included." /></div> : <>
        {rows("OPERATING ACTIVITIES", report.operatingActivities)}
        {rows("INVESTING ACTIVITIES", report.investingActivities)}
        {rows("FINANCING ACTIVITIES", report.financingActivities)}
        {report.unclassifiedActivities.length > 0 && rows("UNCLASSIFIED ACTIVITIES", report.unclassifiedActivities)}
        <div className="grid gap-3 border-t border-ink-200 bg-surface-muted p-4 sm:grid-cols-3"><Metric label="Net Cash from Operating Activities" value={money(report.netOperatingCashFlow, currency)} /><Metric label="Net Cash from Investing Activities" value={money(report.netInvestingCashFlow, currency)} /><Metric label="Net Cash from Financing Activities" value={money(report.netFinancingCashFlow, currency)} /></div>
        <div className="grid gap-3 border-t border-ink-200 p-4 sm:grid-cols-3"><Metric label="Beginning Cash" value={money(report.beginningCash, currency)} /><Metric label="Net Change in Cash" value={money(report.netChangeInCash, currency)} /><Metric label="Ending Cash" value={money(report.endingCash, currency)} /></div>
        <div className="flex flex-col gap-3 border-t border-ink-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm text-ink-600">Beginning Cash + Net Change in Cash = Ending Cash</div><Badge variant={reconciled ? "success" : "danger"}>{reconciled ? "CASH FLOW RECONCILED" : "CASH FLOW DOES NOT RECONCILE"}</Badge></div>
        {report.unclassifiedActivities.length > 0 && <p className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500 sm:px-6">{report.unclassifiedActivities.length} movement{report.unclassifiedActivities.length === 1 ? " remains" : "s remain"} unclassified because the existing Chart of Accounts does not provide enough information to safely determine an activity category.</p>}
      </>}
    </CardContent></Card>
  </div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-ink-100 bg-white p-3"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 font-display text-sm font-semibold text-ink-900 tabular-nums">{value}</p></div>; }
