import { prisma } from "@/lib/prisma";
import type { FiscalYear, PeriodStatus } from "@prisma/client";
import { getOwnedCompany, getOwnedFiscalYear } from "./access";

export type FiscalYearResult =
  | { ok: true; fiscalYear: FiscalYear }
  | { ok: false; error: string };

export type CreateFiscalYearInput = {
  companyId: string;
  name: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Creates a fiscal year for a company.
 *
 * - Re-verifies the company belongs to the caller's organization (never
 *   trusts companyId alone).
 * - Rejects endDate <= startDate (also enforced by a DB CHECK constraint,
 *   this just returns a friendlier message before hitting the DB).
 * - Rejects date ranges that overlap any existing fiscal year for the same
 *   company. This can't be a simple unique constraint (it's a range
 *   comparison), so it's enforced here with an explicit query.
 * - Does NOT create accounting periods — that's a separate, explicit step
 *   (see generateAndCreateAccountingPeriods in accounting-periods.ts), per
 *   spec section 4.
 */
export async function createFiscalYear(
  organizationId: string,
  input: CreateFiscalYearInput
): Promise<FiscalYearResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  if (!(input.endDate.getTime() > input.startDate.getTime())) {
    return { ok: false, error: "Fiscal year end date must be after the start date." };
  }

  // Overlap check: any existing fiscal year for this company whose range
  // intersects [startDate, endDate]. Two ranges [a,b] and [c,d] overlap iff
  // a <= d AND c <= b.
  const overlapping = await prisma.fiscalYear.findFirst({
    where: {
      companyId: company.id,
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
  });
  if (overlapping) {
    return {
      ok: false,
      error: `Dates overlap with an existing fiscal year for this company ("${overlapping.name}").`,
    };
  }

  try {
    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        companyId: company.id,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });
    return { ok: true, fiscalYear };
  } catch {
    // Most likely the @@unique([companyId, name]) constraint.
    return { ok: false, error: "A fiscal year with this name already exists for this company." };
  }
}

/**
 * Lists every fiscal year belonging to a company, most recent start date
 * first, with a count of its accounting periods attached (so the UI can
 * render the "Number of Accounting Periods" column without a second
 * round trip per row). Returns null if the company doesn't exist / doesn't
 * belong to the caller's organization — same ownership rule as everywhere
 * else in this module.
 */
export async function listFiscalYears(organizationId: string, companyId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  return prisma.fiscalYear.findMany({
    where: { companyId: company.id },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { accountingPeriods: true } } },
  });
}

export type UpdateFiscalYearInput = {
  companyId: string;
  name: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Updates a fiscal year's name and date range.
 *
 * Re-verifies the fiscal year belongs to companyId, which belongs to the
 * caller's organization, before touching anything. Runs the same
 * end-after-start and overlap checks as createFiscalYear, excluding the
 * fiscal year being edited from the overlap comparison (a fiscal year is
 * always allowed to overlap with its own, unmodified date range).
 */
export async function updateFiscalYear(
  organizationId: string,
  fiscalYearId: string,
  input: UpdateFiscalYearInput
): Promise<FiscalYearResult> {
  const existing = await getOwnedFiscalYear(organizationId, input.companyId, fiscalYearId);
  if (!existing) {
    return { ok: false, error: "Fiscal year not found." };
  }

  if (!(input.endDate.getTime() > input.startDate.getTime())) {
    return { ok: false, error: "Fiscal year end date must be after the start date." };
  }

  const overlapping = await prisma.fiscalYear.findFirst({
    where: {
      companyId: existing.companyId,
      id: { not: existing.id },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
  });
  if (overlapping) {
    return {
      ok: false,
      error: `Dates overlap with an existing fiscal year for this company ("${overlapping.name}").`,
    };
  }

  try {
    const fiscalYear = await prisma.fiscalYear.update({
      where: { id: existing.id },
      data: { name: input.name, startDate: input.startDate, endDate: input.endDate },
    });
    return { ok: true, fiscalYear };
  } catch {
    return { ok: false, error: "A fiscal year with this name already exists for this company." };
  }
}

/**
 * Returns the fiscal year for `companyId` whose date range contains today,
 * or null if none does. Never creates one automatically.
 *
 * Signature note: the spec lists this as getCurrentFiscalYear(companyId).
 * organizationId is added as the first argument (always supplied by the
 * caller from the authenticated session, never from the browser) so this
 * function can enforce the Organization → Company ownership check itself
 * rather than relying on every caller to remember to do it first.
 */
export async function getCurrentFiscalYear(
  organizationId: string,
  companyId: string
): Promise<FiscalYear | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const today = new Date();
  return prisma.fiscalYear.findFirst({
    where: {
      companyId: company.id,
      startDate: { lte: today },
      endDate: { gte: today },
    },
  });
}

/**
 * Sets a fiscal year's status (OPEN / CLOSED / LOCKED). Status changes
 * don't block anything yet — journal entries don't exist in this phase —
 * this just persists the state so a later phase can start enforcing it
 * without another schema change.
 */
export async function setFiscalYearStatus(
  organizationId: string,
  companyId: string,
  fiscalYearId: string,
  status: PeriodStatus
): Promise<FiscalYearResult> {
  const fiscalYear = await getOwnedFiscalYear(organizationId, companyId, fiscalYearId);
  if (!fiscalYear) {
    return { ok: false, error: "Fiscal year not found." };
  }

  const updated = await prisma.fiscalYear.update({
    where: { id: fiscalYear.id },
    data: { status },
  });
  return { ok: true, fiscalYear: updated };
}

export const openFiscalYear = (organizationId: string, companyId: string, fiscalYearId: string) =>
  setFiscalYearStatus(organizationId, companyId, fiscalYearId, "OPEN");

export const closeFiscalYear = (organizationId: string, companyId: string, fiscalYearId: string) =>
  setFiscalYearStatus(organizationId, companyId, fiscalYearId, "CLOSED");

export const lockFiscalYear = (organizationId: string, companyId: string, fiscalYearId: string) =>
  setFiscalYearStatus(organizationId, companyId, fiscalYearId, "LOCKED");
