import { Prisma, AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IncomeStatementFilters = {
  fiscalYearId?: string;
  accountingPeriodId?: string;
  dateFrom: Date;
  dateTo: Date;
  accountId?: string;
  accountSearch?: string;
};

export type IncomeStatementValidation = {
  revenueAccounts: number;
  expenseAccounts: number;
  totalRevenue: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  netIncome: Prisma.Decimal;
};

const ZERO = () => new Prisma.Decimal(0);
const INCOME_TYPES: AccountType[] = ["REVENUE", "EXPENSE"];

async function validateScopedFilters(organizationId: string, companyId: string, filters: IncomeStatementFilters) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) return null;

  if (filters.dateFrom > filters.dateTo) return null;

  let fiscalYear: { id: string; startDate: Date; endDate: Date } | null = null;
  if (filters.fiscalYearId) {
    fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: filters.fiscalYearId, companyId, company: { organizationId } },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!fiscalYear) return null;
    if (filters.dateFrom < fiscalYear.startDate || filters.dateTo > fiscalYear.endDate) return null;
  }

  if (filters.accountingPeriodId) {
    const period = await prisma.accountingPeriod.findFirst({
      where: { id: filters.accountingPeriodId, companyId, company: { organizationId } },
      select: { id: true, fiscalYearId: true, startDate: true, endDate: true },
    });
    if (!period) return null;
    if (filters.fiscalYearId && period.fiscalYearId !== filters.fiscalYearId) return null;
    if (filters.dateFrom < period.startDate || filters.dateTo > period.endDate) return null;
  }

  if (filters.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: filters.accountId, companyId, company: { organizationId }, type: { in: INCOME_TYPES } },
      select: { id: true },
    });
    if (!account) return null;
  }

  return { fiscalYear };
}

function ledgerWhere(
  organizationId: string,
  companyId: string,
  filters: IncomeStatementFilters
): Prisma.GeneralLedgerEntryWhereInput {
  return {
    organizationId,
    companyId,
    journalEntry: { companyId, status: "POSTED", company: { organizationId } },
    account: {
      companyId,
      type: { in: INCOME_TYPES },
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
    fiscalYear: {
      companyId,
      ...(filters.fiscalYearId ? { id: filters.fiscalYearId } : {}),
    },
    accountingPeriod: {
      companyId,
      ...(filters.accountingPeriodId ? { id: filters.accountingPeriodId } : {}),
    },
    entryDate: { gte: filters.dateFrom, lte: filters.dateTo },
  };
}

async function aggregateIncomeStatement(organizationId: string, companyId: string, filters: IncomeStatementFilters) {
  const scoped = await validateScopedFilters(organizationId, companyId, filters);
  if (!scoped) return null;

  const groups = await prisma.generalLedgerEntry.groupBy({
    by: ["accountId"],
    where: ledgerWhere(organizationId, companyId, filters),
    _sum: { debit: true, credit: true },
  });

  if (groups.length === 0) {
    return {
      revenueAccounts: [],
      expenseAccounts: [],
      totalRevenue: ZERO(),
      totalExpenses: ZERO(),
      netIncome: ZERO(),
    };
  }

  const accounts = await prisma.account.findMany({
    where: {
      id: { in: groups.map((group) => group.accountId) },
      companyId,
      company: { organizationId },
      type: { in: INCOME_TYPES },
    },
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  let totalRevenue = ZERO();
  let totalExpenses = ZERO();

  const revenueAccounts: { account: typeof accounts[number]; amount: Prisma.Decimal }[] = [];
  const expenseAccounts: { account: typeof accounts[number]; amount: Prisma.Decimal }[] = [];

  for (const group of groups) {
    const account = accountById.get(group.accountId);
    if (!account) continue;
    const debit = group._sum.debit ?? ZERO();
    const credit = group._sum.credit ?? ZERO();
    const amount = account.type === "REVENUE" ? credit.minus(debit) : debit.minus(credit);

    if (account.type === "REVENUE") {
      totalRevenue = totalRevenue.plus(amount);
      revenueAccounts.push({ account, amount });
    } else {
      totalExpenses = totalExpenses.plus(amount);
      expenseAccounts.push({ account, amount });
    }
  }

  return { revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome: totalRevenue.minus(totalExpenses) };
}

export async function calculateIncomeStatement(
  organizationId: string,
  companyId: string,
  filters: IncomeStatementFilters
) {
  return aggregateIncomeStatement(organizationId, companyId, filters);
}

export async function validateIncomeStatement(
  organizationId: string,
  companyId: string,
  filters: IncomeStatementFilters
): Promise<IncomeStatementValidation | null> {
  const result = await aggregateIncomeStatement(organizationId, companyId, filters);
  if (!result) return null;
  return {
    revenueAccounts: result.revenueAccounts.length,
    expenseAccounts: result.expenseAccounts.length,
    totalRevenue: result.totalRevenue,
    totalExpenses: result.totalExpenses,
    netIncome: result.netIncome,
  };
}

export async function getIncomeStatementFilterOptions(organizationId: string, companyId: string) {
  return Promise.all([
    prisma.account.findMany({
      where: { companyId, company: { organizationId }, type: { in: INCOME_TYPES } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.fiscalYear.findMany({
      where: { companyId, company: { organizationId } },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.accountingPeriod.findMany({
      where: { companyId, company: { organizationId } },
      select: { id: true, fiscalYearId: true, name: true, startDate: true, endDate: true },
      orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
    }),
    prisma.company.findFirst({
      where: { id: companyId, organizationId },
      select: { id: true, displayName: true, currency: true },
    }),
  ]).then(([accounts, fiscalYears, accountingPeriods, company]) => ({ accounts, fiscalYears, accountingPeriods, company }));
}
