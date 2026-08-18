import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canReviewJournalEntries } from "@/lib/rbac";
import { listFiscalYears } from "@/accounting/fiscal-years";
import { listAccountingPeriods } from "@/accounting/accounting-periods";
import { listReadyForPostingJournalEntries, type ReadyForPostingSort } from "@/accounting/journal-entries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntriesError } from "@/components/journal-entries/journal-entries-error";
import { JournalEntriesPagination } from "@/components/journal-entries/journal-entries-pagination";
import { ReadyForPostingFilterBar } from "@/components/journal-entries/ready-for-posting-filter-bar";
import { ReadyForPostingTable } from "@/components/journal-entries/ready-for-posting-table";
import type { FiscalYear, AccountingPeriod } from "@prisma/client";

export const metadata = { title: "Ready for Posting — Ledger" };
const PAGE_SIZE = 25;

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
}

export default async function ReadyForPostingPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: {
    search?: string;
    date?: string;
    fiscalYearId?: string;
    accountingPeriodId?: string;
    status?: string;
    sort?: string;
    direction?: string;
    page?: string;
  };
}) {
  const { role, organization } = await requireActiveOrganization();
  if (!canReviewJournalEntries(role)) notFound();

  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  let fiscalYears: FiscalYear[] = [];
  let accountingPeriods: AccountingPeriod[] = [];
  try {
    fiscalYears = (await listFiscalYears(organization.id, company.id)) ?? [];
    const selectedYear = fiscalYears.find((year) => year.id === searchParams.fiscalYearId);
    accountingPeriods = selectedYear
      ? (await listAccountingPeriods(organization.id, company.id, selectedYear.id)) ?? []
      : [];
  } catch {
    return <JournalEntriesError />;
  }

  const selectedFiscalYear = fiscalYears.find((year) => year.id === searchParams.fiscalYearId);
  const fiscalYearId = selectedFiscalYear?.id;
  const accountingPeriodId = accountingPeriods.some((period) => period.id === searchParams.accountingPeriodId)
    ? searchParams.accountingPeriodId
    : undefined;
  const date = parseDate(searchParams.date);
  const validSorts: ReadyForPostingSort[] = ["entryDate", "entryNumber", "totalDebit", "totalCredit"];
  const sort = validSorts.includes(searchParams.sort as ReadyForPostingSort) ? searchParams.sort as ReadyForPostingSort : "entryDate";
  const direction = searchParams.direction === "asc" ? "asc" : "desc";
  const page = Math.max(Number.parseInt(searchParams.page ?? "1", 10) || 1, 1);

  let result;
  try {
    result = await listReadyForPostingJournalEntries(organization.id, company.id, {
      search: searchParams.search?.trim() || undefined,
      date,
      fiscalYearId,
      accountingPeriodId,
      status: searchParams.status === "READY_FOR_POSTING" || !searchParams.status ? "READY_FOR_POSTING" : undefined,
      sort,
      direction,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch {
    return <JournalEntriesError />;
  }

  if (!result) return <JournalEntriesError />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={basePath} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Journal Entries
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">Ready for Posting</h1>
            <CheckCircle2 className="h-5 w-5 text-positive" />
          </div>
          <p className="text-sm text-ink-500">Human-reviewed journal entries awaiting the future posting step.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">Total Entries</p><p className="mt-1 font-display text-2xl font-semibold text-ink-900">{result.summary.totalEntries}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">Total Debit</p><p className="mt-1 font-mono text-xl font-semibold text-ink-900">{formatMoney(result.summary.totalDebit)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">Total Credit</p><p className="mt-1 font-mono text-xl font-semibold text-ink-900">{formatMoney(result.summary.totalCredit)}</p></CardContent></Card>
      </div>

      <div className="rounded-lg border border-pending/20 bg-pending/5 px-4 py-3 text-sm text-ink-800">
        <div className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-pending" /><p><strong>Posting is not available in this phase.</strong> Entries shown here have reached READY_FOR_POSTING, but the actual POST action belongs to a future phase.</p></div>
      </div>

      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card">
        <ReadyForPostingFilterBar fiscalYears={fiscalYears} accountingPeriods={accountingPeriods} />
        {result.total === 0 ? (
          <div className="p-4">
            <EmptyState icon={ClipboardCheck} title="No journal entries are ready for posting." description="Reviewed and validated journal entries will appear here." />
          </div>
        ) : (
          <>
            {result.entries.some((entry) => entry.readinessErrors.length > 0) ? (
              <div className="border-b border-pending/20 bg-pending/5 px-4 py-3 text-sm text-ink-800">
                <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pending" /><p>One or more ready entries now require review because their current accounting state changed after approval.</p></div>
              </div>
            ) : null}
            <div className="overflow-x-auto"><ReadyForPostingTable companyId={company.id} entries={result.entries} /></div>
            <JournalEntriesPagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} />
          </>
        )}
      </div>
    </div>
  );
}
