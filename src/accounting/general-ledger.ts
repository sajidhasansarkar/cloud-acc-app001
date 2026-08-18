import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type GeneralLedgerFilters = {
  accountId?: string;
  accountSearch?: string;
  dateFrom?: Date;
  dateTo?: Date;
  fiscalYearId?: string;
  accountingPeriodId?: string;
  page?: number;
  pageSize?: number;
};

export type GeneralLedgerConsistency = {
  valid: boolean;
  journalEntryId: string;
  status: string | null;
  expectedLineCount: number;
  ledgerRecordCount: number;
  duplicateCount: number;
  errors: string[];
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function scopedLedgerWhere(
  organizationId: string,
  companyId: string,
  filters: GeneralLedgerFilters
): Prisma.GeneralLedgerEntryWhereInput {
  const where: Prisma.GeneralLedgerEntryWhereInput = {
    organizationId,
    companyId,
    journalEntry: { companyId, company: { organizationId } },
    account: { companyId, ...(filters.accountSearch ? {
      OR: [
        { code: { contains: filters.accountSearch, mode: "insensitive" } },
        { name: { contains: filters.accountSearch, mode: "insensitive" } },
      ],
    } : {}) },
    fiscalYear: { companyId },
    accountingPeriod: { companyId, ...(filters.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}) },
  };

  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.fiscalYearId) where.fiscalYearId = filters.fiscalYearId;
  if (filters.accountingPeriodId) where.accountingPeriodId = filters.accountingPeriodId;
  if (filters.dateFrom || filters.dateTo) {
    where.entryDate = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  return where;
}

export async function listGeneralLedger(
  organizationId: string,
  companyId: string,
  filters: GeneralLedgerFilters = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = scopedLedgerWhere(organizationId, companyId, filters);

  const [total, entries] = await Promise.all([
    prisma.generalLedgerEntry.count({ where }),
    prisma.generalLedgerEntry.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        journalEntry: { select: { id: true, entryNumber: true } },
      },
      orderBy: [{ entryDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getGeneralLedgerFilterOptions(organizationId: string, companyId: string) {
  const [accounts, fiscalYears, accountingPeriods] = await Promise.all([
    prisma.account.findMany({
      where: { companyId, company: { organizationId } },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.fiscalYear.findMany({
      where: { companyId, company: { organizationId } },
      orderBy: { startDate: "desc" },
    }),
    prisma.accountingPeriod.findMany({
      where: { companyId, company: { organizationId } },
      orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
    }),
  ]);
  return { accounts, fiscalYears, accountingPeriods };
}

export async function getOwnedAccountForLedger(
  organizationId: string,
  companyId: string,
  accountId: string
) {
  return prisma.account.findFirst({
    where: { id: accountId, companyId, company: { organizationId } },
    select: { id: true, code: true, name: true, type: true },
  });
}

export async function listAccountLedger(
  organizationId: string,
  companyId: string,
  accountId: string,
  filters: Omit<GeneralLedgerFilters, "accountId" | "accountSearch"> = {}
) {
  const account = await getOwnedAccountForLedger(organizationId, companyId, accountId);
  if (!account) return null;

  const result = await listGeneralLedger(organizationId, companyId, { ...filters, accountId });
  const first = result.entries[0];
  let openingBalance = new Prisma.Decimal(0);

  if (first) {
    const beforeFirst = await prisma.generalLedgerEntry.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        organizationId,
        companyId,
        accountId,
        OR: [
          { entryDate: { lt: first.entryDate } },
          { entryDate: first.entryDate, id: { lt: first.id } },
        ],
      },
    });
    openingBalance = normalBalanceDelta(account.type, beforeFirst._sum.debit ?? new Prisma.Decimal(0), beforeFirst._sum.credit ?? new Prisma.Decimal(0));
  }

  let runningBalance = openingBalance;
  const rows = result.entries.map((entry) => {
    runningBalance = runningBalance.plus(normalBalanceDelta(account.type, entry.debit, entry.credit));
    return { ...entry, runningBalance };
  });

  return { ...result, account, openingBalance, entries: rows };
}

function normalBalanceDelta(
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
  debit: Prisma.Decimal,
  credit: Prisma.Decimal
) {
  return accountType === "ASSET" || accountType === "EXPENSE"
    ? debit.minus(credit)
    : credit.minus(debit);
}

/**
 * Verifies that a POSTED Journal Entry has exactly one immutable ledger
 * projection per journal line and that every copied accounting dimension
 * still belongs to the same company/organization and matches the source.
 */
export async function validateJournalEntryLedgerConsistency(
  journalEntryId: string
): Promise<GeneralLedgerConsistency> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: {
      company: { select: { id: true, organizationId: true } },
      fiscalYear: { select: { id: true, companyId: true } },
      accountingPeriod: { select: { id: true, companyId: true, fiscalYearId: true } },
      lines: { include: { account: { select: { id: true, companyId: true } } } },
    },
  });

  if (!entry) {
    return { valid: false, journalEntryId, status: null, expectedLineCount: 0, ledgerRecordCount: 0, duplicateCount: 0, errors: ["Journal entry not found."] };
  }

  const ledger = await prisma.generalLedgerEntry.findMany({
    where: { journalEntryId },
    select: {
      id: true, journalEntryLineId: true, organizationId: true, companyId: true,
      accountId: true, fiscalYearId: true, accountingPeriodId: true, entryDate: true,
      debit: true, credit: true,
      account: { select: { companyId: true } },
    },
  });

  const errors: string[] = [];
  if (entry.status !== "POSTED") errors.push("Journal Entry is not POSTED.");
  if (entry.fiscalYear.companyId !== entry.companyId) errors.push("Fiscal Year does not belong to the Journal Entry company.");
  if (entry.accountingPeriod.companyId !== entry.companyId || entry.accountingPeriod.fiscalYearId !== entry.fiscalYearId) errors.push("Accounting Period does not belong to the Journal Entry fiscal year/company.");
  if (ledger.length !== entry.lines.length) errors.push("Ledger record count does not match Journal Entry line count.");

  const lineIds = new Set<string>();
  let duplicateCount = 0;
  for (const row of ledger) {
    if (lineIds.has(row.journalEntryLineId)) duplicateCount += 1;
    lineIds.add(row.journalEntryLineId);
    if (row.organizationId !== entry.company.organizationId) errors.push("Ledger organization does not match the Journal Entry organization.");
    if (row.companyId !== entry.companyId) errors.push("Ledger company does not match the Journal Entry company.");
    if (row.account.companyId !== entry.companyId) errors.push("Ledger account does not belong to the Journal Entry company.");
    if (row.fiscalYearId !== entry.fiscalYearId) errors.push("Ledger fiscal year does not match the Journal Entry.");
    if (row.accountingPeriodId !== entry.accountingPeriodId) errors.push("Ledger accounting period does not match the Journal Entry.");
    if (row.entryDate.getTime() !== entry.entryDate.getTime()) errors.push("Ledger date does not match the Journal Entry.");
  }
  if (duplicateCount > 0) errors.push("Duplicate ledger records exist for Journal Entry lines.");

  const ledgerByLine = new Map(ledger.map((row) => [row.journalEntryLineId, row]));
  for (const line of entry.lines) {
    const row = ledgerByLine.get(line.id);
    if (!row) {
      errors.push(`Ledger record is missing for Journal Entry line ${line.lineNumber}.`);
      continue;
    }
    if (row.accountId !== line.accountId || line.account.companyId !== entry.companyId) errors.push(`Ledger account does not match Journal Entry line ${line.lineNumber}.`);
    if (!row.debit.eq(line.debit)) errors.push(`Ledger debit does not match Journal Entry line ${line.lineNumber}.`);
    if (!row.credit.eq(line.credit)) errors.push(`Ledger credit does not match Journal Entry line ${line.lineNumber}.`);
  }

  return {
    valid: errors.length === 0,
    journalEntryId,
    status: entry.status,
    expectedLineCount: entry.lines.length,
    ledgerRecordCount: ledger.length,
    duplicateCount,
    errors: [...new Set(errors)],
  };
}
