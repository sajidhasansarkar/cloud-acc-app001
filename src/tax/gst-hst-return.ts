import { Prisma, AccountType, TaxType, CalculationMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany, getOwnedFiscalYear, getOwnedAccountingPeriod } from "@/accounting/access";

export type GstHstReturnFilters = {
  dateFrom: Date;
  dateTo: Date;
  fiscalYearId?: string;
  accountingPeriodId?: string;
};

export type GstHstReturnLine = {
  journalEntryId: string;
  journalEntryLineId: string;
  generalLedgerEntryId: string | null;
  entryNumber: string;
  entryDate: Date;
  accountId: string;
  accountCode: string;
  accountName: string;
  taxCodeId: string;
  taxCode: string;
  taxRate: Prisma.Decimal;
  taxType: TaxType;
  calculationMethod: CalculationMethod;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  treatment: "SALES" | "PURCHASE";
  recoverable: boolean;
};

export type GstHstTaxCodeSummary = {
  taxCodeId: string;
  taxCode: string;
  taxCodeName: string;
  taxRate: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
};

export type GstHstReturnResult = {
  configured: boolean;
  currency: string;
  taxableSales: Prisma.Decimal;
  taxCollected: Prisma.Decimal;
  taxablePurchases: Prisma.Decimal;
  taxPaid: Prisma.Decimal;
  netTaxPosition: Prisma.Decimal;
  salesByTaxCode: GstHstTaxCodeSummary[];
  purchasesByTaxCode: GstHstTaxCodeSummary[];
  taxCodes: {
    id: string;
    code: string;
    name: string;
    taxType: TaxType;
    rate: Prisma.Decimal;
    calculationMethod: CalculationMethod;
    isRecoverable: boolean;
  }[];
  lines: GstHstReturnLine[];
};

const ZERO = () => new Prisma.Decimal(0);
const GST_HST_TYPES: TaxType[] = ["GST", "HST"];

function lineAmount(line: { debit: Prisma.Decimal; credit: Prisma.Decimal }) {
  return line.debit.gt(0) ? line.debit : line.credit;
}

type GstHstCalculationLine = {
  id: string;
  lineOrder: number;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  account: { id: string; code: string; name: string; type: AccountType };
  taxCode: {
    id: string;
    code: string;
    name: string;
    rate: Prisma.Decimal;
    taxType: TaxType;
    calculationMethod: CalculationMethod;
    isRecoverable: boolean;
  } | null;
  generalLedgerEntries: { id: string }[];
  journalEntry: { id: string; entryNumber: string; entryDate: Date };
};

export function calculateGstHstTotals(
  lines: GstHstCalculationLine[]
) {
  let taxableSales = ZERO();
  let taxCollected = ZERO();
  let taxablePurchases = ZERO();
  let taxPaid = ZERO();
  const reportLines: GstHstReturnLine[] = [];
  const salesByTaxCode = new Map<string, GstHstTaxCodeSummary>();
  const purchasesByTaxCode = new Map<string, GstHstTaxCodeSummary>();

  const addSummary = (target: Map<string, GstHstTaxCodeSummary>, taxCode: NonNullable<GstHstCalculationLine["taxCode"]>, taxableAmount: Prisma.Decimal, taxAmount: Prisma.Decimal) => {
    const existing = target.get(taxCode.id);
    if (existing) {
      existing.taxableAmount = existing.taxableAmount.plus(taxableAmount);
      existing.taxAmount = existing.taxAmount.plus(taxAmount);
    } else {
      target.set(taxCode.id, {
        taxCodeId: taxCode.id,
        taxCode: taxCode.code,
        taxCodeName: taxCode.name,
        taxRate: taxCode.rate,
        taxableAmount,
        taxAmount,
      });
    }
  };

  for (const line of lines) {
    const taxCode = line.taxCode;
    if (!taxCode) continue;

    const taxableAmount = lineAmount(line);
    if (taxableAmount.isZero()) continue;

    const applicable =
      taxCode.calculationMethod === "STANDARD_RATE" ||
      taxCode.calculationMethod === "ZERO_RATE";

    if (!applicable) continue;

    const taxAmount = taxableAmount.mul(taxCode.rate).div(100);

    if (line.account.type === AccountType.REVENUE) {
      taxableSales = taxableSales.plus(taxableAmount);
      taxCollected = taxCollected.plus(taxAmount);
      addSummary(salesByTaxCode, taxCode, taxableAmount, taxAmount);
      reportLines.push({
        journalEntryId: line.journalEntry.id,
        journalEntryLineId: line.id,
        generalLedgerEntryId: line.generalLedgerEntries[0]?.id ?? null,
        entryNumber: line.journalEntry.entryNumber,
        entryDate: line.journalEntry.entryDate,
        accountId: line.account.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        taxCodeId: taxCode.id,
        taxCode: taxCode.code,
        taxRate: taxCode.rate,
        taxType: taxCode.taxType,
        calculationMethod: taxCode.calculationMethod,
        taxableAmount,
        taxAmount,
        treatment: "SALES",
        recoverable: taxCode.isRecoverable,
      });
    } else if (
      (line.account.type === AccountType.EXPENSE ||
        line.account.type === AccountType.ASSET) &&
      taxCode.isRecoverable
    ) {
      taxablePurchases = taxablePurchases.plus(taxableAmount);
      taxPaid = taxPaid.plus(taxAmount);
      addSummary(purchasesByTaxCode, taxCode, taxableAmount, taxAmount);
      reportLines.push({
        journalEntryId: line.journalEntry.id,
        journalEntryLineId: line.id,
        generalLedgerEntryId: line.generalLedgerEntries[0]?.id ?? null,
        entryNumber: line.journalEntry.entryNumber,
        entryDate: line.journalEntry.entryDate,
        accountId: line.account.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        taxCodeId: taxCode.id,
        taxCode: taxCode.code,
        taxRate: taxCode.rate,
        taxType: taxCode.taxType,
        calculationMethod: taxCode.calculationMethod,
        taxableAmount,
        taxAmount,
        treatment: "PURCHASE",
        recoverable: taxCode.isRecoverable,
      });
    }
  }

  return {
    taxableSales,
    taxCollected,
    taxablePurchases,
    taxPaid,
    netTaxPosition: taxCollected.minus(taxPaid),
    salesByTaxCode: Array.from(salesByTaxCode.values()),
    purchasesByTaxCode: Array.from(purchasesByTaxCode.values()),
    lines: reportLines,
  };
}

/**
 * Validates the report ownership chain and returns the selected fiscal year
 * and period. Browser-supplied ids are only filters; ownership is always
 * re-derived through Organization -> Company -> FiscalYear / Period.
 */
async function validateFilters(
  organizationId: string,
  companyId: string,
  filters: GstHstReturnFilters
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company || filters.dateFrom > filters.dateTo) return null;

  let fiscalYear: { id: string; startDate: Date; endDate: Date } | null = null;
  if (filters.fiscalYearId) {
    fiscalYear = await getOwnedFiscalYear(organizationId, company.id, filters.fiscalYearId);
    if (!fiscalYear) return null;
    if (filters.dateFrom < fiscalYear.startDate || filters.dateTo > fiscalYear.endDate) return null;
  }

  let accountingPeriod: { id: string; companyId: string; fiscalYearId: string; startDate: Date; endDate: Date } | null = null;
  if (filters.accountingPeriodId) {
    accountingPeriod = await getOwnedAccountingPeriod(
      organizationId,
      company.id,
      filters.accountingPeriodId
    );
    if (!accountingPeriod) return null;
    if (filters.fiscalYearId && accountingPeriod.fiscalYearId !== filters.fiscalYearId) return null;
    if (filters.dateFrom < accountingPeriod.startDate || filters.dateTo > accountingPeriod.endDate) return null;
  }

  return { company, fiscalYear, accountingPeriod };
}

/**
 * GST/HST calculation foundation.
 *
 * A POSTED Journal Entry Line is a tax-report line only when the line
 * explicitly references a company-owned GST or HST TaxCode. At least one
 * active GST/HST code must exist for the company before reporting is
 * considered configured; inactive referenced codes remain available for
 * historical traceability. The line's posted accounting amount is the
 * taxable amount. Tax amount is
 * calculated from the stored TaxCode rate using Prisma.Decimal.
 *
 * Treatment is deliberately conservative:
 * - REVENUE accounts -> sales / tax collected.
 * - EXPENSE and ASSET accounts -> purchases / input tax.
 * - Other account classes are ignored because the existing accounting model
 * does not contain an explicit tax treatment field and this foundation must
 * not guess.
 *
 * Purchase input tax is included only when TaxCode.isRecoverable is true.
 * EXEMPT and OUT_OF_SCOPE codes do not create taxable amounts or tax.
 */
export async function calculateGstHstReturn(
  organizationId: string,
  companyId: string,
  filters: GstHstReturnFilters
): Promise<GstHstReturnResult | null> {
  const scoped = await validateFilters(organizationId, companyId, filters);
  if (!scoped) return null;

  const { company } = scoped;

  const activeTaxCodeCount = await prisma.taxCode.count({
    where: {
      companyId: company.id,
      countryCode: company.country.toUpperCase(),
      taxType: { in: GST_HST_TYPES },
      isActive: true,
    },
  });

  const taxCodes = await prisma.taxCode.findMany({
    where: {
      companyId: company.id,
      countryCode: company.country.toUpperCase(),
      taxType: { in: GST_HST_TYPES },
    },
    select: {
      id: true,
      code: true,
      name: true,
      taxType: true,
      rate: true,
      calculationMethod: true,
      isRecoverable: true,
    },
    orderBy: [{ code: "asc" }],
  });

  const base = {
    configured: activeTaxCodeCount > 0,
    currency: company.currency.toUpperCase(),
    taxableSales: ZERO(),
    taxCollected: ZERO(),
    taxablePurchases: ZERO(),
    taxPaid: ZERO(),
    netTaxPosition: ZERO(),
    taxCodes,
    salesByTaxCode: [] as GstHstTaxCodeSummary[],
    purchasesByTaxCode: [] as GstHstTaxCodeSummary[],
    lines: [] as GstHstReturnLine[],
  };

  if (activeTaxCodeCount === 0) return base;

  const taxCodeIds = taxCodes.map((taxCode) => taxCode.id);

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      taxCodeId: { in: taxCodeIds },
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        company: { organizationId },
        entryDate: { gte: filters.dateFrom, lte: filters.dateTo },
        ...(filters.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters.accountingPeriodId ? { accountingPeriodId: filters.accountingPeriodId } : {}),
      },
      account: { companyId: company.id },
    },
    select: {
      id: true,
      lineOrder: true,
      debit: true,
      credit: true,
      account: { select: { id: true, code: true, name: true, type: true } },
      taxCode: {
        select: {
          id: true,
          code: true,
          name: true,
          rate: true,
          taxType: true,
          calculationMethod: true,
          isRecoverable: true,
        },
      },
      generalLedgerEntries: { select: { id: true }, take: 1 },
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
        },
      },
    },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { lineOrder: "asc" }],
  });

  const totals = calculateGstHstTotals(lines);
  return {
    ...base,
    taxableSales: totals.taxableSales,
    taxCollected: totals.taxCollected,
    taxablePurchases: totals.taxablePurchases,
    taxPaid: totals.taxPaid,
    netTaxPosition: totals.netTaxPosition,
    salesByTaxCode: totals.salesByTaxCode,
    purchasesByTaxCode: totals.purchasesByTaxCode,
    lines: totals.lines,
  };
}

export async function getGstHstReturnFilterOptions(
  organizationId: string,
  companyId: string
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const [fiscalYears, accountingPeriods] = await Promise.all([
    prisma.fiscalYear.findMany({
      where: { companyId: company.id, company: { organizationId } },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.accountingPeriod.findMany({
      where: { companyId: company.id, company: { organizationId } },
      select: { id: true, fiscalYearId: true, name: true, startDate: true, endDate: true },
      orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
    }),
  ]);

  return {
    company: {
      id: company.id,
      displayName: company.displayName,
      country: company.country,
      currency: company.currency.toUpperCase(),
    },
    fiscalYears,
    accountingPeriods,
  };
}
