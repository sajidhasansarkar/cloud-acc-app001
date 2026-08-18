import Link from "next/link";
import { ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { calculateGstHstReturn, getGstHstReturnFilterOptions } from "@/tax/gst-hst-return";
import { GstHstReturnFilterBar } from "@/components/tax/gst-hst-return-filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "GST/HST Return — Ledger" };

function parseDate(value?: string, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function displayDate(date: Date) { return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }); }
function money(value: { toFixed: (digits: number) => string }, currency: string) { return `${currency} ${value.toFixed(2)}`; }

type FiscalYearHeader = { id: string; name: string; startDate: Date; endDate: Date };
type PeriodHeader = { id: string; name: string; fiscalYearId: string; startDate: Date; endDate: Date };

export default async function GstHstReturnPage({ params, searchParams }: { params: { companyId: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const { organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const options = await getGstHstReturnFilterOptions(organization.id, company.id);
  if (!options) return <EmptyState icon={ShieldCheck} title="Unable to load GST/HST Return." description="The selected company is not available in the current organization." />;

  const fiscalYearId = typeof searchParams?.fiscalYearId === "string" ? searchParams.fiscalYearId : undefined;
  const accountingPeriodId = typeof searchParams?.accountingPeriodId === "string" ? searchParams.accountingPeriodId : undefined;
  const rawFrom = typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : undefined;
  const rawTo = typeof searchParams?.dateTo === "string" ? searchParams.dateTo : undefined;
  const fiscalYear = options.fiscalYears.find((item) => item.id === fiscalYearId);
  const accountingPeriod = options.accountingPeriods.find((item) => item.id === accountingPeriodId);
  const currentFiscalYear = fiscalYear ?? options.fiscalYears.find((item) => new Date() >= item.startDate && new Date() <= item.endDate) ?? options.fiscalYears[0];
  const from = parseDate(rawFrom) ?? accountingPeriod?.startDate ?? currentFiscalYear?.startDate;
  const to = parseDate(rawTo, true) ?? accountingPeriod?.endDate ?? currentFiscalYear?.endDate;
  const invalidDates = Boolean((rawFrom && !parseDate(rawFrom)) || (rawTo && !parseDate(rawTo, true)));
  const filterValues = { dateFrom: rawFrom ?? (from ? isoDate(from) : ""), dateTo: rawTo ?? (to ? isoDate(to) : ""), fiscalYearId, accountingPeriodId };

  if (!from || !to || invalidDates) {
    return <div className="space-y-6"><ReportHeader companyName={company.displayName} currency={company.currency} from={from} to={to} fiscalYear={fiscalYear} accountingPeriod={accountingPeriod} /><GstHstReturnFilterBar fiscalYears={options.fiscalYears} accountingPeriods={options.accountingPeriods} values={filterValues} /><EmptyState icon={FileText} title={invalidDates ? "Invalid reporting dates." : "No fiscal year or accounting period available."} description={invalidDates ? "Enter valid From Date and To Date values." : "Create a fiscal year and accounting period before preparing a GST/HST return."} /></div>;
  }

  const report = await calculateGstHstReturn(organization.id, company.id, { dateFrom: from, dateTo: to, fiscalYearId, accountingPeriodId });
  if (!report) {
    return <div className="space-y-6"><ReportHeader companyName={company.displayName} currency={company.currency} from={from} to={to} fiscalYear={fiscalYear} accountingPeriod={accountingPeriod} /><GstHstReturnFilterBar fiscalYears={options.fiscalYears} accountingPeriods={options.accountingPeriods} values={filterValues} /><EmptyState icon={ShieldCheck} title="Invalid GST/HST report filters." description="The selected fiscal year, accounting period, or reporting dates do not belong to this company." /></div>;
  }

  const netLabel = report.netTaxPosition.gt(0) ? "TAX PAYABLE" : report.netTaxPosition.lt(0) ? "TAX CREDIT / REFUND" : "NO NET TAX";
  const netVariant = report.netTaxPosition.gt(0) ? "warning" : report.netTaxPosition.lt(0) ? "success" : "default";

  return <div className="space-y-6">
    <ReportHeader companyName={company.displayName} currency={report.currency} from={from} to={to} fiscalYear={fiscalYear} accountingPeriod={accountingPeriod} />
    <GstHstReturnFilterBar fiscalYears={options.fiscalYears} accountingPeriods={options.accountingPeriods} values={filterValues} />

    {!report.configured ? <EmptyState icon={ShieldCheck} title="GST/HST reporting is not configured for this company." description="Configure an active GST/HST Tax Code for this company's country before preparing this report." action={<Link href={`/companies/${company.id}/settings/tax`} className="inline-flex h-9 items-center rounded bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">Open Tax Settings</Link>} />
      : report.lines.length === 0 ? <EmptyState icon={FileText} title="No posted GST/HST transactions available for this period." description="Only POSTED Journal Entry Lines explicitly associated with GST/HST Tax Codes are included." />
      : <>
        <Card><CardHeader><CardTitle>GST/HST Return</CardTitle><CardDescription>Read-only review of posted accounting data for the selected reporting period.</CardDescription></CardHeader><CardContent><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Taxable Sales" value={money(report.taxableSales, report.currency)} /><Metric label="Tax Collected" value={money(report.taxCollected, report.currency)} /><Metric label="Taxable Purchases" value={money(report.taxablePurchases, report.currency)} /><Metric label="Eligible Input Tax Credits" value={money(report.taxPaid, report.currency)} /><Metric label={netLabel} value={money(report.netTaxPosition, report.currency)} emphasis /></div></CardContent></Card>
        <TaxSection title="SALES / OUTPUT TAX" description="Taxable revenue lines and tax calculated from the company's configured GST/HST Tax Codes." rows={report.salesByTaxCode} totalTaxableLabel="Total Taxable Sales" totalTaxLabel="Total Tax Collected" totalTaxable={report.taxableSales} totalTax={report.taxCollected} currency={report.currency} companyId={company.id} />
        <TaxSection title="PURCHASES / INPUT TAX CREDITS" description="Eligible purchase/input tax only; recoverability comes from the existing Tax Code configuration." rows={report.purchasesByTaxCode} totalTaxableLabel="Total Taxable Purchases" totalTaxLabel="Total Eligible Input Tax Credits" totalTaxable={report.taxablePurchases} totalTax={report.taxPaid} currency={report.currency} companyId={company.id} />
        <Card><CardHeader><CardTitle>Net Tax Position</CardTitle><CardDescription>Tax Collected − Eligible Input Tax Credits</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center"><div className="space-y-2"><SummaryRow label="Tax Collected" value={money(report.taxCollected, report.currency)} /><SummaryRow label="Eligible Input Tax Credits" value={money(report.taxPaid, report.currency)} negative /><div className="border-t border-ink-100 pt-3"><SummaryRow label="Net Tax Position" value={money(report.netTaxPosition, report.currency)} strong /></div></div><div className="rounded-lg border border-ink-100 bg-surface-muted px-5 py-4 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Result</p><Badge className="mt-2" variant={netVariant}>{netLabel}</Badge><p className="mt-2 font-mono text-lg font-semibold tabular-nums text-ink-900">{money(report.netTaxPosition, report.currency)}</p></div></div></CardContent></Card>
        <Card className="overflow-hidden"><CardHeader><CardTitle>Posted GST/HST Transaction Drill-Down</CardTitle><CardDescription>Tax Code → Account / General Ledger → Journal Entry. The report is read-only.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[1120px] text-sm"><thead className="border-b border-ink-100 bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Journal Entry</th><th className="px-4 py-3">Account / GL</th><th className="px-4 py-3">Tax Code</th><th className="px-4 py-3">Treatment</th><th className="px-4 py-3 text-right">Taxable</th><th className="px-4 py-3 text-right">Tax</th></tr></thead><tbody className="divide-y divide-ink-50">{report.lines.map((line) => <tr key={line.journalEntryLineId} className="hover:bg-surface-subtle"><td className="px-4 py-3 text-ink-700">{displayDate(line.entryDate)}</td><td className="px-4 py-3"><Link href={`/companies/${company.id}/journal-entries/${line.journalEntryId}`} className="inline-flex items-center gap-1 font-mono text-xs font-medium text-ledger-600 hover:underline">{line.entryNumber}<ExternalLink className="h-3 w-3" /></Link><div className="mt-1 text-[10px] text-ink-400">POSTED</div></td><td className="px-4 py-3"><Link href={`/companies/${company.id}/general-ledger/${line.accountId}?dateFrom=${isoDate(from)}&dateTo=${isoDate(to)}${fiscalYearId ? `&fiscalYearId=${encodeURIComponent(fiscalYearId)}` : ""}${accountingPeriodId ? `&accountingPeriodId=${encodeURIComponent(accountingPeriodId)}` : ""}`} className="block hover:underline"><span className="font-mono text-xs text-ink-500">{line.accountCode}</span><span className="ml-2 text-ink-800">{line.accountName}</span></Link>{line.generalLedgerEntryId ? <p className="mt-1 text-[10px] text-ink-400">GL: {line.generalLedgerEntryId}</p> : null}</td><td className="px-4 py-3"><Link href={`/companies/${company.id}/settings/tax?q=${encodeURIComponent(line.taxCode)}`} className="font-medium text-ledger-600 hover:underline">{line.taxCode}</Link><span className="ml-1 text-xs text-ink-500">({line.taxRate.toFixed(4)}%)</span></td><td className="px-4 py-3 text-ink-700">{line.treatment === "SALES" ? "Sales / Output" : "Purchase / Input"}</td><td className="px-4 py-3 text-right font-mono tabular-nums text-ink-800">{money(line.taxableAmount, report.currency)}</td><td className="px-4 py-3 text-right font-mono tabular-nums text-ink-800">{money(line.taxAmount, report.currency)}</td></tr>)}</tbody></table></CardContent></Card>
      </>}
  </div>;
}

function ReportHeader({ companyName, currency, from, to, fiscalYear, accountingPeriod }: { companyName: string; currency: string; from?: Date; to?: Date; fiscalYear?: FiscalYearHeader; accountingPeriod?: PeriodHeader }) {
  return <div className="flex flex-col gap-4 border-b border-ink-100 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ledger-600">Tax Report</p><h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-900">GST/HST Return</h1><p className="mt-1 text-sm text-ink-500">{companyName}</p>{from && to ? <p className="mt-1 text-sm text-ink-500">Reporting Period: {displayDate(from)} to {displayDate(to)}</p> : null}<div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-500">{fiscalYear ? <span className="rounded border border-ink-100 bg-white px-2 py-1">Fiscal Year: <strong className="text-ink-700">{fiscalYear.name}</strong></span> : null}{accountingPeriod ? <span className="rounded border border-ink-100 bg-white px-2 py-1">Accounting Period: <strong className="text-ink-700">{accountingPeriod.name}</strong></span> : null}</div></div><div className="rounded-md border border-ink-100 bg-white px-3 py-2 text-right shadow-card"><p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Reporting Currency</p><p className="mt-0.5 font-mono text-sm font-semibold text-ink-800">{currency.toUpperCase()}</p></div></div>;
}
function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div className={`rounded-md border px-4 py-3 ${emphasis ? "border-ledger-200 bg-surface-muted shadow-sm" : "border-ink-100 bg-white"}`}><p className="text-xs text-ink-500">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink-900">{value}</p></div>; }
function SummaryRow({ label, value, negative = false, strong = false }: { label: string; value: string; negative?: boolean; strong?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${strong ? "text-base font-semibold text-ink-900" : "text-sm text-ink-700"}`}><span>{label}</span><span className="font-mono tabular-nums text-ink-900">{negative ? `− ${value}` : value}</span></div>; }

function TaxSection({ title, description, rows, totalTaxableLabel, totalTaxLabel, totalTaxable, totalTax, currency, companyId }: { title: string; description: string; rows: { taxCodeId: string; taxCode: string; taxCodeName: string; taxRate: { toFixed: (digits: number) => string }; taxableAmount: { toFixed: (digits: number) => string }; taxAmount: { toFixed: (digits: number) => string } }[]; totalTaxableLabel: string; totalTaxLabel: string; totalTaxable: { toFixed: (digits: number) => string }; totalTax: { toFixed: (digits: number) => string }; currency: string; companyId: string }) {
  return <Card className="overflow-hidden"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b border-ink-100 bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Tax Code</th><th className="px-4 py-3 text-right">Taxable Amount</th><th className="px-4 py-3 text-right">Tax Amount</th></tr></thead><tbody className="divide-y divide-ink-50">{rows.map((row) => <tr key={row.taxCodeId}><td className="px-4 py-3"><Link href={`/companies/${companyId}/settings/tax?q=${encodeURIComponent(row.taxCode)}`} className="font-medium text-ledger-600 hover:underline">{row.taxCode}</Link><span className="ml-2 text-xs text-ink-500">{row.taxCodeName} · {row.taxRate.toFixed(4)}%</span></td><td className="px-4 py-3 text-right font-mono tabular-nums text-ink-800">{money(row.taxableAmount, currency)}</td><td className="px-4 py-3 text-right font-mono tabular-nums text-ink-800">{money(row.taxAmount, currency)}</td></tr>)}</tbody><tfoot className="border-t border-ink-200 bg-surface-muted"><tr><td className="px-4 py-3 font-semibold text-ink-800">{totalTaxableLabel}</td><td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-ink-900">{money(totalTaxable, currency)}</td><td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-ink-900">{money(totalTax, currency)}</td></tr><tr><td colSpan={2} className="px-4 py-3 text-right font-semibold text-ink-800">{totalTaxLabel}</td><td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-ink-900">{money(totalTax, currency)}</td></tr></tfoot></table></div></CardContent></Card>;
}
