import { Prisma, AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BalanceSheetFilters = {
  fiscalYearId?: string;
  asOfDate: Date;
  accountId?: string;
  accountSearch?: string;
};

export type BalanceSheetValidation = {
  balanced: boolean;
  totalAssets: Prisma.Decimal;
  totalLiabilities: Prisma.Decimal;
  totalEquity: Prisma.Decimal;
  difference: Prisma.Decimal;
};

const ZERO = () => new Prisma.Decimal(0);
const BALANCE_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY"];

async function validateScopedFilters(organizationId: string, companyId: string, filters: BalanceSheetFilters) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true },
  });
  if (!company) return null;

  let fiscalYear: { id: string; startDate: Date; endDate: Date } | null = null;
  if (filters.fiscalYearId) {
    fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: filters.fiscalYearId, companyId, company: { organizationId } },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!fiscalYear) return null;
    if (filters.asOfDate < fiscalYear.startDate || filters.asOfDate > fiscalYear.endDate) {
      return null;
    }
  }

  if (filters.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: filters.accountId, companyId, company: { organizationId } },
      select: { id: true },
    });
    if (!account) return null;
  }

  return { fiscalYear };
}

function ledgerWhere(
  organizationId: string,
  companyId: string,
  filters: BalanceSheetFilters
): Prisma.GeneralLedgerEntryWhereInput {
  return {
    organizationId,
    companyId,
    journalEntry: { companyId, status: "POSTED" },
    account: {
      companyId,
      type: { in: BALANCE_TYPES },
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
    ...(filters.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
    entryDate: { lte: filters.asOfDate },
  };
}

async function aggregateBalanceSheet(organizationId: string, companyId: string, filters: BalanceSheetFilters) {
  const scoped = await validateScopedFilters(organizationId, companyId, filters);
  if (!scoped) return null;

  const groups = await prisma.generalLedgerEntry.groupBy({
    by: ["accountId"],
    where: ledgerWhere(organizationId, companyId, filters),
    _sum: { debit: true, credit: true },
  });

  if (groups.length === 0) {
    return {
      rows: [],
      totalAssets: ZERO(),
      totalLiabilities: ZERO(),
      totalEquity: ZERO(),
      difference: ZERO(),
      balanced: true,
    };
  }

  const accounts = await prisma.account.findMany({
    where: {
      id: { in: groups.map((group) => group.accountId) },
      companyId,
      company: { organizationId },
      type: { in: BALANCE_TYPES },
    },
    select: { id: true, code: true, name: true, type: true, subtype: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let totalAssets = ZERO();
  let totalLiabilities = ZERO();
  let totalEquity = ZERO();

  const rows = groups.flatMap((group) => {
    const account = accountById.get(group.accountId);
    if (!account) return [];
    const debit = group._sum.debit ?? ZERO();
    const credit = group._sum.credit ?? ZERO();
    const balance = account.type === "ASSET" ? debit.minus(credit) : credit.minus(debit);

    if (account.type === "ASSET") totalAssets = totalAssets.plus(balance);
    if (account.type === "LIABILITY") totalLiabilities = totalLiabilities.plus(balance);
    if (account.type === "EQUITY") totalEquity = totalEquity.plus(balance);

    return [{ account, debit, credit, balance }];
  });

  const difference = totalAssets.minus(totalLiabilities.plus(totalEquity));
  return { rows, totalAssets, totalLiabilities, totalEquity, difference, balanced: difference.eq(0) };
}

export async function validateBalanceSheet(
  organizationId: string,
  companyId: string,
  filters: BalanceSheetFilters
): Promise<BalanceSheetValidation> {
  const result = await aggregateBalanceSheet(organizationId, companyId, filters);
  if (!result) {
    return { balanced: false, totalAssets: ZERO(), totalLiabilities: ZERO(), totalEquity: ZERO(), difference: ZERO() };
  }
  return {
    balanced: result.balanced,
    totalAssets: result.totalAssets,
    totalLiabilities: result.totalLiabilities,
    totalEquity: result.totalEquity,
    difference: result.difference,
  };
}

export async function getBalanceSheet(
  organizationId: string,
  companyId: string,
  filters: BalanceSheetFilters
) {
  const result = await aggregateBalanceSheet(organizationId, companyId, filters);
  if (!result) return null;

  return {
    ...result,
    sections: {
      ASSET: result.rows.filter((row) => row.account.type === "ASSET"),
      LIABILITY: result.rows.filter((row) => row.account.type === "LIABILITY"),
      EQUITY: result.rows.filter((row) => row.account.type === "EQUITY"),
    },
  };
}

export async function getBalanceSheetFilterOptions(organizationId: string, companyId: string) {
  return Promise.all([
    prisma.account.findMany({
      where: { companyId, company: { organizationId }, type: { in: BALANCE_TYPES } },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.fiscalYear.findMany({
      where: { companyId, company: { organizationId } },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    }),
  ]).then(([accounts, fiscalYears]) => ({ accounts, fiscalYears }));
}
