import { prisma } from "@/lib/prisma";
import type { AccountingPeriod, PeriodStatus } from "@prisma/client";
import { getOwnedCompany, getOwnedFiscalYear, getOwnedAccountingPeriod } from "./access";

export type PeriodFrequency = "MONTHLY" | "QUARTERLY";

export type GeneratedPeriod = {
  periodNumber: number;
  name: string;
  startDate: Date;
  endDate: Date;
};

const MONTHS_PER_PERIOD: Record<PeriodFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Adds `months` calendar months to a UTC date, keeping the same
// day-of-month where possible. Using Date.UTC (rather than local-time
// getMonth/setMonth) means this is immune to the server's timezone and to
// DST — a fiscal year boundary is a calendar date, not a moment in time.
// Correctly rolls across year boundaries and handles leap years for free,
// since Date.UTC does real Gregorian calendar math (Feb 2024 has 29 days,
// Feb 2025 has 28, etc.) rather than a fixed day-count assumption.
function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/**
 * Pure function: splits a fiscal year's date range into periods. Does not
 * touch the database and does not assume the fiscal year starts in
 * January — periods are always derived from the fiscal year's own
 * startDate, per spec section 5.
 *
 * MONTHLY  -> 12 periods, one per calendar month starting at startDate.
 * QUARTERLY -> 4 periods, one per 3-calendar-month block starting at
 *              startDate.
 *
 * The very last period's endDate is always pinned to the fiscal year's own
 * endDate (rather than "start of next period minus a day"), so the periods
 * exactly tile the fiscal year even if its length isn't a perfectly clean
 * multiple of months/quarters.
 */
export function generateAccountingPeriods(
  fiscalYear: { startDate: Date; endDate: Date },
  frequency: PeriodFrequency
): GeneratedPeriod[] {
  const monthsPerPeriod = MONTHS_PER_PERIOD[frequency];
  const periodCount = 12 / monthsPerPeriod; // 12 for MONTHLY, 4 for QUARTERLY

  const periods: GeneratedPeriod[] = [];

  for (let i = 0; i < periodCount; i++) {
    const periodNumber = i + 1;
    const periodStart = addMonthsUTC(fiscalYear.startDate, i * monthsPerPeriod);
    const isLastPeriod = i === periodCount - 1;

    const periodEnd = isLastPeriod
      ? fiscalYear.endDate
      : addDaysUTC(addMonthsUTC(fiscalYear.startDate, (i + 1) * monthsPerPeriod), -1);

    const name =
      frequency === "MONTHLY"
        ? MONTH_NAMES[periodStart.getUTCMonth()]
        : `${MONTH_NAMES[periodStart.getUTCMonth()]}–${MONTH_NAMES[periodEnd.getUTCMonth()]}`;

    periods.push({ periodNumber, name, startDate: periodStart, endDate: periodEnd });
  }

  return periods;
}

export type GeneratePeriodsResult =
  | { ok: true; periods: AccountingPeriod[] }
  | { ok: false; error: string };

/**
 * Generates and persists accounting periods for a fiscal year.
 *
 * - Re-verifies the fiscal year belongs to companyId, which belongs to the
 *   caller's organization.
 * - companyId on each created period is taken from the fiscal year record
 *   itself (never from client input), so a period can never end up
 *   attached to a different company than its own fiscal year.
 * - Refuses to run if periods already exist for this fiscal year, so
 *   re-running the generator can't create duplicates or partially
 *   overlapping period sets.
 * - Runs as a single transaction so a mid-batch failure (e.g. a
 *   periodNumber collision) leaves no partial set of periods behind.
 */
export async function generateAndCreateAccountingPeriods(
  organizationId: string,
  companyId: string,
  fiscalYearId: string,
  frequency: PeriodFrequency
): Promise<GeneratePeriodsResult> {
  const fiscalYear = await getOwnedFiscalYear(organizationId, companyId, fiscalYearId);
  if (!fiscalYear) {
    return { ok: false, error: "Fiscal year not found." };
  }

  const existingCount = await prisma.accountingPeriod.count({
    where: { fiscalYearId: fiscalYear.id },
  });
  if (existingCount > 0) {
    return { ok: false, error: "Accounting periods already exist for this fiscal year." };
  }

  const generated = generateAccountingPeriods(fiscalYear, frequency);

  const periods = await prisma.$transaction(
    generated.map((period) =>
      prisma.accountingPeriod.create({
        data: {
          companyId: fiscalYear.companyId, // derived from the fiscal year, not from input
          fiscalYearId: fiscalYear.id,
          name: period.name,
          periodNumber: period.periodNumber,
          startDate: period.startDate,
          endDate: period.endDate,
        },
      })
    )
  );

  return { ok: true, periods };
}

/**
 * Lists every accounting period belonging to a fiscal year, in period
 * order. Re-verifies the fiscal year belongs to companyId, which belongs
 * to the caller's organization, before returning anything. Returns null if
 * that ownership check fails.
 */
export async function listAccountingPeriods(
  organizationId: string,
  companyId: string,
  fiscalYearId: string
) {
  const fiscalYear = await getOwnedFiscalYear(organizationId, companyId, fiscalYearId);
  if (!fiscalYear) return null;

  return prisma.accountingPeriod.findMany({
    where: { fiscalYearId: fiscalYear.id },
    orderBy: { periodNumber: "asc" },
  });
}

/**
 * Returns the accounting period for `companyId` whose date range contains
 * today, or null if none does. Never creates one automatically.
 *
 * Same organizationId note as getCurrentFiscalYear: added as the first
 * argument so ownership is checked here rather than trusted from the
 * caller.
 */
export async function getCurrentAccountingPeriod(
  organizationId: string,
  companyId: string
): Promise<AccountingPeriod | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const today = new Date();
  return prisma.accountingPeriod.findFirst({
    where: {
      companyId: company.id,
      startDate: { lte: today },
      endDate: { gte: today },
    },
  });
}

export type AccountingPeriodResult =
  | { ok: true; period: AccountingPeriod }
  | { ok: false; error: string };

/**
 * Sets an accounting period's status (OPEN / CLOSED / LOCKED). As with
 * fiscal years, this doesn't block anything yet — no journal entries exist
 * in this phase — it just persists the state.
 */
export async function setAccountingPeriodStatus(
  organizationId: string,
  companyId: string,
  periodId: string,
  status: PeriodStatus
): Promise<AccountingPeriodResult> {
  const period = await getOwnedAccountingPeriod(organizationId, companyId, periodId);
  if (!period) {
    return { ok: false, error: "Accounting period not found." };
  }

  const updated = await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: { status },
  });
  return { ok: true, period: updated };
}

export const openAccountingPeriod = (
  organizationId: string,
  companyId: string,
  periodId: string
) => setAccountingPeriodStatus(organizationId, companyId, periodId, "OPEN");

export const closeAccountingPeriod = (
  organizationId: string,
  companyId: string,
  periodId: string
) => setAccountingPeriodStatus(organizationId, companyId, periodId, "CLOSED");

export const lockAccountingPeriod = (
  organizationId: string,
  companyId: string,
  periodId: string
) => setAccountingPeriodStatus(organizationId, companyId, periodId, "LOCKED");
