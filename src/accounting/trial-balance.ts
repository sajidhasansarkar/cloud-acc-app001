import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TrialBalanceFilters = {
  fiscalYearId?: string;
  accountingPeriodId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  accountId?: string;
  accountSearch?: string;
  page?: number;
  pageSize?: number;
};

export type TrialBalanceValidation = {
  balanced: boolean;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  difference: Prisma.Decimal;
  accountCount: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ZERO = () => new Prisma.Decimal(0);

async function resolveScopedFilterAccountIds(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters
) {
  if (!filters.accountId && !filters.accountSearch) return undefined;

  const accounts = await prisma.account.findMany({
    where: {
      companyId,
      company: { organizationId },
      ...(filters.accountId ? { id: filters.accountId } : {}),
      ...(filters.accountSearch
        ? {
            OR: [
              { code: { contains: filters.accountSearch, mode: "insensitive" } },
              { name: { contains: filters.accountSearch, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true },
  });

  return accounts.map((account) => account.id);
}

async function validateScopedFilters(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) return { valid: false, accountIds: [] as string[] };

  if (filters.fiscalYearId) {
    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: filters.fiscalYearId, companyId, company: { organizationId } },
      select: { id: true },
    });
    if (!fiscalYear) return { valid: false, accountIds: [] as string[] };
  }

  if (filters.accountingPeriodId) {
    const period = await prisma.accountingPeriod.findFirst({
      where: { id: filters.accountingPeriodId, companyId, company: { organizationId } },
      select: { id: true, fiscalYearId: true },
    });
    if (!period) return { valid: false, accountIds: [] as string[] };
    if (filters.fiscalYearId && period.fiscalYearId !== filters.fiscalYearId) {
      return { valid: false, accountIds: [] as string[] };
    }
  }

  const accountIds = await resolveScopedFilterAccountIds(organizationId, companyId, filters);
  if (filters.accountId && accountIds?.length === 0) return { valid: false, accountIds };
  if (filters.accountSearch && accountIds?.length === 0) return { valid: true, accountIds };

  return { valid: true, accountIds };
}

function ledgerWhere(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters,
  accountIds?: string[]
): Prisma.GeneralLedgerEntryWhereInput {
  return {
    organizationId,
    companyId,
    journalEntry: { companyId, status: "POSTED" },
    account: { companyId },
    fiscalYear: {
      companyId,
      ...(filters.fiscalYearId ? { id: filters.fiscalYearId } : {}),
    },
    accountingPeriod: {
      companyId,
      ...(filters.accountingPeriodId ? { id: filters.accountingPeriodId } : {}),
    },
    ...(accountIds ? { accountId: { in: accountIds } } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          entryDate: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };
}

async function aggregateTrialBalance(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters
) {
  const scoped = await validateScopedFilters(organizationId, companyId, filters);
  if (!scoped.valid) return null;
  if (scoped.accountIds && scoped.accountIds.length === 0) {
    return { rows: [], totalDebit: ZERO(), totalCredit: ZERO(), difference: ZERO(), balanced: true, accountCount: 0 };
  }

  const where = ledgerWhere(organizationId, companyId, filters, scoped.accountIds);
  const groups = await prisma.generalLedgerEntry.groupBy({
    by: ["accountId"],
    where,
    _sum: { debit: true, credit: true },
    orderBy: { accountId: "asc" },
  });

  if (groups.length === 0) {
    return { rows: [], totalDebit: ZERO(), totalCredit: ZERO(), difference: ZERO(), balanced: true, accountCount: 0 };
  }

  const accounts = await prisma.account.findMany({
    where: {
      id: { in: groups.map((group) => group.accountId) },
      companyId,
      company: { organizationId },
    },
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  let totalDebit = ZERO();
  let totalCredit = ZERO();

  const rows = groups
    .map((group) => {
      const account = accountById.get(group.accountId);
      if (!account) return null;
      const debit = group._sum.debit ?? ZERO();
      const credit = group._sum.credit ?? ZERO();
      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
      const balance = account.type === "ASSET" || account.type === "EXPENSE"
        ? debit.minus(credit)
        : credit.minus(debit);
      return { account, debit, credit, balance };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const difference = totalDebit.minus(totalCredit);
  return {
    rows,
    totalDebit,
    totalCredit,
    difference,
    balanced: difference.eq(0),
    accountCount: rows.length,
  };
}

export async function validateTrialBalance(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters = {}
): Promise<TrialBalanceValidation> {
  const result = await aggregateTrialBalance(organizationId, companyId, filters);
  if (!result) {
    return { balanced: false, totalDebit: ZERO(), totalCredit: ZERO(), difference: ZERO(), accountCount: 0 };
  }
  return {
    balanced: result.balanced,
    totalDebit: result.totalDebit,
    totalCredit: result.totalCredit,
    difference: result.difference,
    accountCount: result.accountCount,
  };
}

export async function listTrialBalance(
  organizationId: string,
  companyId: string,
  filters: TrialBalanceFilters = {}
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const result = await aggregateTrialBalance(organizationId, companyId, filters);

  if (!result) return null;

  const totalPages = Math.max(1, Math.ceil(result.accountCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const rows = result.rows.slice(start, start + pageSize);
  return {
    rows,
    totalDebit: result.totalDebit,
    totalCredit: result.totalCredit,
    difference: result.difference,
    balanced: result.balanced,
    accountCount: result.accountCount,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function getTrialBalanceFilterOptions(organizationId: string, companyId: string) {
  return Promise.all([
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
  ]).then(([accounts, fiscalYears, accountingPeriods]) => ({ accounts, fiscalYears, accountingPeriods }));
}
