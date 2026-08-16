import { prisma } from "@/lib/prisma";

/**
 * Ownership-chain lookups for the fiscal year / accounting period module.
 *
 * The rule enforced everywhere in this module: Authenticated User →
 * Organization → Company → FiscalYear → AccountingPeriod. A bare id coming
 * from the browser (companyId, fiscalYearId, periodId) is never trusted on
 * its own — every read/write re-derives ownership from the caller's
 * organizationId first. These helpers are the single place that does that,
 * so every function in fiscal-years.ts / accounting-periods.ts uses the
 * same rule instead of re-implementing it slightly differently each time.
 */

// A company scoped to the caller's organization, or null if it doesn't
// exist / doesn't belong to that organization. Never throws — callers
// decide how to report "not found" vs. "not yours" (deliberately the same
// message either way, so as not to leak which ids exist in other orgs).
export async function getOwnedCompany(organizationId: string, companyId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, organizationId },
  });
}

// A fiscal year scoped to a specific company, which itself must belong to
// the caller's organization. Both hops are checked in one query.
export async function getOwnedFiscalYear(
  organizationId: string,
  companyId: string,
  fiscalYearId: string
) {
  return prisma.fiscalYear.findFirst({
    where: {
      id: fiscalYearId,
      companyId,
      company: { organizationId },
    },
  });
}

// An accounting period scoped to a specific company + organization. Its
// fiscalYearId is trusted from the period row itself (not re-validated
// against a client-supplied fiscalYearId), since the row already went
// through this same ownership check when it was created.
export async function getOwnedAccountingPeriod(
  organizationId: string,
  companyId: string,
  periodId: string
) {
  return prisma.accountingPeriod.findFirst({
    where: {
      id: periodId,
      companyId,
      company: { organizationId },
    },
  });
}
