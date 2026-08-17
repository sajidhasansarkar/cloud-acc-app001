import Link from "next/link";
import { BookText, Plus } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listJournalEntries, listJournalEntryLabels } from "@/accounting/journal-entries";
import { listFiscalYears } from "@/accounting/fiscal-years";
import { listAccountingPeriods } from "@/accounting/accounting-periods";
import { canManageJournalEntries } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntriesTable } from "@/components/journal-entries/journal-entries-table";
import { JournalEntriesFilterBar } from "@/components/journal-entries/journal-entries-filter-bar";
import { JournalEntriesPagination } from "@/components/journal-entries/journal-entries-pagination";
import { JournalEntriesError } from "@/components/journal-entries/journal-entries-error";
import {
  JOURNAL_ENTRY_SOURCE_TYPES,
  JOURNAL_ENTRY_STATUSES,
} from "@/lib/constants";
import type { JournalEntryListSort, JournalEntryListDatePreset } from "@/accounting/journal-entries";
import type { AccountingPeriod, FiscalYear, JournalEntrySourceType, JournalEntryStatus } from "@prisma/client";

export const metadata = { title: "Journal Entries — Ledger" };

const SORT_KEYS: JournalEntryListSort[] = ["entryDate", "entryNumber", "reference", "status", "createdAt"];
const PAGE_SIZE = 25;

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function hasActiveFilters(searchParams: {
  search?: string;
  status?: string;
  source?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  fiscalYearId?: string;
  accountingPeriodId?: string;
  label?: string;
  reference?: string;
}) {
  return [
    searchParams.search,
    searchParams.status,
    searchParams.source,
    searchParams.date,
    searchParams.startDate,
    searchParams.endDate,
    searchParams.fiscalYearId,
    searchParams.accountingPeriodId,
    searchParams.label,
    searchParams.reference,
  ].some(Boolean);
}

export default async function CompanyJournalEntriesPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: {
    search?: string;
    status?: string;
    source?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    fiscalYearId?: string;
    accountingPeriodId?: string;
    label?: string;
    reference?: string;
    sort?: string;
    direction?: string;
    page?: string;
  };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageJournalEntries(role);
  const basePath = `/companies/${company.id}/journal-entries`;

  let fiscalYears: FiscalYear[];
  let accountingPeriods: AccountingPeriod[];
  let labels: string[];
  try {
    const [fiscalYearRows, labelRows] = await Promise.all([
      listFiscalYears(organization.id, company.id),
      listJournalEntryLabels(organization.id, company.id),
    ]);
    fiscalYears = fiscalYearRows ?? [];
    const selectedFiscalYearForOptions = fiscalYears.find((year) => year.id === searchParams.fiscalYearId);
    accountingPeriods = selectedFiscalYearForOptions
      ? (await listAccountingPeriods(organization.id, company.id, selectedFiscalYearForOptions.id)) ?? []
      : [];
    labels = labelRows ?? [];
  } catch {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink-900">Journal Entries</h1>
            <p className="text-sm text-ink-500">Manual and automated journal entries for {company.displayName}.</p>
          </div>
        </div>
        <JournalEntriesError />
      </div>
    );
  }

  const selectedFiscalYear = fiscalYears.find((year) => year.id === searchParams.fiscalYearId);

  const status = JOURNAL_ENTRY_STATUSES.includes(searchParams.status as JournalEntryStatus)
    ? (searchParams.status as JournalEntryStatus)
    : undefined;
  const sourceType = JOURNAL_ENTRY_SOURCE_TYPES.includes(searchParams.source as JournalEntrySourceType)
    ? (searchParams.source as JournalEntrySourceType)
    : undefined;
  const fiscalYearId = selectedFiscalYear?.id;
  const accountingPeriodId = accountingPeriods.some((period) => period.id === searchParams.accountingPeriodId)
    ? searchParams.accountingPeriodId
    : undefined;

  const datePreset = ["today", "this_month", "custom"].includes(searchParams.date ?? "")
    ? (searchParams.date as JournalEntryListDatePreset | "custom")
    : undefined;
  const startDate = datePreset === "custom" ? parseDate(searchParams.startDate) : undefined;
  const endDate = datePreset === "custom" ? parseDate(searchParams.endDate) : undefined;
  const validCustomRange = !startDate || !endDate || endDate >= startDate;

  const hasValidSort = SORT_KEYS.includes(searchParams.sort as JournalEntryListSort);
  const sort = hasValidSort ? (searchParams.sort as JournalEntryListSort) : "entryDate";
  const direction = hasValidSort && searchParams.direction === "asc" ? "asc" : "desc";
  const page = Math.max(Number.parseInt(searchParams.page ?? "1", 10) || 1, 1);

  let result;
  try {
    result = await listJournalEntries(organization.id, company.id, {
      search: searchParams.search?.trim() || undefined,
      status,
      sourceType,
      fiscalYearId,
      accountingPeriodId,
      label: searchParams.label?.trim() || undefined,
      reference: searchParams.reference?.trim() || undefined,
      datePreset: datePreset === "custom" ? undefined : datePreset,
      startDate: validCustomRange ? startDate : undefined,
      endDate: validCustomRange ? endDate : undefined,
      sort,
      direction,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink-900">Journal Entries</h1>
            <p className="text-sm text-ink-500">Manual and automated journal entries for {company.displayName}.</p>
          </div>
        </div>
        <JournalEntriesError />
      </div>
    );
  }

  if (!result) {
    return <JournalEntriesError />;
  }

  const filtersActive = hasActiveFilters(searchParams);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Journal Entries</h1>
          <p className="text-sm text-ink-500">Manual and automated journal entries for {company.displayName}.</p>
        </div>
        {canManage ? (
          <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" />
            New Journal Entry
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card">
        <JournalEntriesFilterBar fiscalYears={fiscalYears} accountingPeriods={accountingPeriods} labels={labels} />

        {result.total === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BookText}
              title={filtersActive ? "No journal entries match your filters." : "No journal entries yet."}
              description={filtersActive ? "Try changing or clearing your filters." : "Create your first journal entry to get started."}
              action={
                filtersActive ? (
                  <Link href={basePath} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Clear Filters
                  </Link>
                ) : canManage ? (
                  <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    <Plus className="h-4 w-4" />
                    New Journal Entry
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <JournalEntriesTable companyId={company.id} entries={result.entries} canManage={canManage} />
            </div>
            <JournalEntriesPagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} />
          </>
        )}
      </div>
    </div>
  );
}
