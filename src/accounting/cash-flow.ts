import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CashFlowFilters = {
  fiscalYearId?: string;
  accountingPeriodId?: string;
  dateFrom: Date;
  dateTo: Date;
};

type Activity = "OPERATING" | "INVESTING" | "FINANCING" | "UNCLASSIFIED";

export type CashFlowActivity = {
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  entryNumber: string;
  entryDate: Date;
  description: string | null;
  reference: string | null;
  amount: Prisma.Decimal;
  activity: Activity;
};

export type CashFlowResult = {
  cashAccounts: { id: string; code: string; name: string; subtype: string | null }[];
  operatingActivities: CashFlowActivity[];
  investingActivities: CashFlowActivity[];
  financingActivities: CashFlowActivity[];
  unclassifiedActivities: CashFlowActivity[];
  netOperatingCashFlow: Prisma.Decimal;
  netInvestingCashFlow: Prisma.Decimal;
  netFinancingCashFlow: Prisma.Decimal;
  netChangeInCash: Prisma.Decimal;
  beginningCash: Prisma.Decimal;
  endingCash: Prisma.Decimal;
};

const ZERO = () => new Prisma.Decimal(0);
const CASH_SUBTYPES = ["Cash", "Bank"];

async function validateScopedFilters(organizationId: string, companyId: string, filters: CashFlowFilters) {
  const company = await prisma.company.findFirst({ where: { id: companyId, organizationId }, select: { id: true } });
  if (!company || filters.dateFrom > filters.dateTo) return null;

  if (filters.fiscalYearId) {
    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { id: filters.fiscalYearId, companyId, company: { organizationId } },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!fiscalYear || filters.dateFrom < fiscalYear.startDate || filters.dateTo > fiscalYear.endDate) return null;
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
  return true;
}

function cashWhere(organizationId: string, companyId: string, filters: CashFlowFilters, throughDate: Date): Prisma.GeneralLedgerEntryWhereInput {
  return {
    organizationId,
    companyId,
    journalEntry: { companyId, status: "POSTED", company: { organizationId } },
    account: { companyId, subtype: { in: CASH_SUBTYPES } },
    ...(filters.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
    ...(filters.accountingPeriodId ? { accountingPeriodId: filters.accountingPeriodId } : {}),
    entryDate: { lte: throughDate },
  };
}

function classifyCounterpart(type: string, subtype: string | null): Activity {
  if (type === "REVENUE" || type === "EXPENSE") return "OPERATING";
  if (type === "LIABILITY" && subtype === "Loan") return "FINANCING";
  if (type === "EQUITY") return "FINANCING";
  if (type === "ASSET" && subtype === "Fixed Asset") return "INVESTING";
  if (type === "ASSET" && (subtype === "Accounts Receivable" || subtype === "Inventory")) return "OPERATING";
  if (type === "LIABILITY" && (subtype === "Accounts Payable" || subtype === "Tax Payable")) return "OPERATING";
  return "UNCLASSIFIED";
}

async function aggregateCashFlow(organizationId: string, companyId: string, filters: CashFlowFilters): Promise<CashFlowResult | null> {
  if (!(await validateScopedFilters(organizationId, companyId, filters))) return null;

  const cashAccounts = await prisma.account.findMany({
    where: { companyId, company: { organizationId }, subtype: { in: CASH_SUBTYPES } },
    select: { id: true, code: true, name: true, subtype: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  const cashIds = cashAccounts.map((a) => a.id);
  if (cashIds.length === 0) {
    return { cashAccounts, operatingActivities: [], investingActivities: [], financingActivities: [], unclassifiedActivities: [], netOperatingCashFlow: ZERO(), netInvestingCashFlow: ZERO(), netFinancingCashFlow: ZERO(), netChangeInCash: ZERO(), beginningCash: ZERO(), endingCash: ZERO() };
  }

  const periodEntries = await prisma.generalLedgerEntry.findMany({
    where: {
      organizationId, companyId,
      journalEntry: { companyId, status: "POSTED", company: { organizationId } },
      accountId: { in: cashIds },
      ...(filters.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
      ...(filters.accountingPeriodId ? { accountingPeriodId: filters.accountingPeriodId } : {}),
      entryDate: { gte: filters.dateFrom, lte: filters.dateTo },
    },
    select: { id: true, journalEntryId: true, accountId: true, entryDate: true, description: true, reference: true, debit: true, credit: true, account: { select: { code: true, name: true } }, journalEntry: { select: { entryNumber: true } } },
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
  });

  const journalIds = [...new Set(periodEntries.map((e) => e.journalEntryId))];
  const counterparts = journalIds.length === 0 ? [] : await prisma.generalLedgerEntry.findMany({
    where: { organizationId, companyId, journalEntryId: { in: journalIds } },
    select: { journalEntryId: true, debit: true, credit: true, account: { select: { id: true, type: true, subtype: true } } },
  });

  const byJournal = new Map<string, typeof counterparts>();
  for (const row of counterparts) byJournal.set(row.journalEntryId, [...(byJournal.get(row.journalEntryId) ?? []), row]);

  const activities: CashFlowActivity[] = periodEntries.map((entry) => {
    const movement = entry.debit.minus(entry.credit);
    const other = (byJournal.get(entry.journalEntryId) ?? []).filter((row) => !cashIds.includes(row.account.id));
    const classifications = [...new Set(other.map((row) => classifyCounterpart(row.account.type, row.account.subtype)))];
    const activity: Activity = classifications.length === 1 ? classifications[0] : "UNCLASSIFIED";
    return { journalEntryId: entry.journalEntryId, accountId: entry.accountId, accountCode: entry.account.code, accountName: entry.account.name, entryNumber: entry.journalEntry.entryNumber, entryDate: entry.entryDate, description: entry.description, reference: entry.reference, amount: movement, activity };
  });

  const operatingActivities = activities.filter((a) => a.activity === "OPERATING");
  const investingActivities = activities.filter((a) => a.activity === "INVESTING");
  const financingActivities = activities.filter((a) => a.activity === "FINANCING");
  const unclassifiedActivities = activities.filter((a) => a.activity === "UNCLASSIFIED");
  const sum = (rows: CashFlowActivity[]) => rows.reduce((total, row) => total.plus(row.amount), ZERO());
  const netOperatingCashFlow = sum(operatingActivities);
  const netInvestingCashFlow = sum(investingActivities);
  const netFinancingCashFlow = sum(financingActivities);
  const netChangeInCash = sum(activities);

  const beginning = await prisma.generalLedgerEntry.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      organizationId,
      companyId,
      journalEntry: { companyId, status: "POSTED", company: { organizationId } },
      accountId: { in: cashIds },
      entryDate: { lt: filters.dateFrom },
    },
  });
  const beginningCash = (beginning._sum.debit ?? ZERO()).minus(beginning._sum.credit ?? ZERO());
  const endingCash = beginningCash.plus(netChangeInCash);

  return { cashAccounts, operatingActivities, investingActivities, financingActivities, unclassifiedActivities, netOperatingCashFlow, netInvestingCashFlow, netFinancingCashFlow, netChangeInCash, beginningCash, endingCash };
}

export async function calculateCashFlow(organizationId: string, companyId: string, filters: CashFlowFilters) {
  return aggregateCashFlow(organizationId, companyId, filters);
}

export async function validateCashFlow(organizationId: string, companyId: string, filters: CashFlowFilters) {
  const result = await aggregateCashFlow(organizationId, companyId, filters);
  if (!result) return null;
  return {
    cashAccountCount: result.cashAccounts.length,
    balancedCashRollForward: result.beginningCash.plus(result.netChangeInCash).eq(result.endingCash),
    netOperatingCashFlow: result.netOperatingCashFlow,
    netInvestingCashFlow: result.netInvestingCashFlow,
    netFinancingCashFlow: result.netFinancingCashFlow,
    netChangeInCash: result.netChangeInCash,
    beginningCash: result.beginningCash,
    endingCash: result.endingCash,
    unclassifiedCount: result.unclassifiedActivities.length,
  };
}

export async function getCashFlowFilterOptions(organizationId: string, companyId: string) {
  const [fiscalYears, accountingPeriods, company] = await Promise.all([
    prisma.fiscalYear.findMany({ where: { companyId, company: { organizationId } }, select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: "desc" } }),
    prisma.accountingPeriod.findMany({ where: { companyId, company: { organizationId } }, select: { id: true, fiscalYearId: true, name: true, startDate: true, endDate: true }, orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }] }),
    prisma.company.findFirst({ where: { id: companyId, organizationId }, select: { id: true, displayName: true, currency: true } }),
  ]);
  return { fiscalYears, accountingPeriods, company };
}
