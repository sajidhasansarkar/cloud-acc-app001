import { prisma } from "@/lib/prisma";

// Reused as-is from the accounting module: "a company scoped to the
// caller's organization" is the same lookup regardless of which module
// needs it, so this doesn't get reimplemented here — see the comment on
// getOwnedCompany in src/accounting/access.ts for the full rationale.
export { getOwnedCompany } from "@/accounting/access";

/**
 * Ownership-chain lookups for the tax module (Phase 3B-1).
 *
 * Same rule as src/accounting/access.ts, applied to tax codes: Authenticated
 * User → Organization → Company → TaxCode. A bare id coming from the caller
 * (companyId, taxCodeId) is never trusted on its own — every read/write
 * re-derives ownership from the caller's organizationId first. This is the
 * single place that does that, so every function in tax-codes.ts uses the
 * same rule instead of re-implementing it slightly differently.
 */

// A tax code scoped to a specific company, which itself must belong to the
// caller's organization. Both hops are checked in one query.
export async function getOwnedTaxCode(
  organizationId: string,
  companyId: string,
  taxCodeId: string
) {
  return prisma.taxCode.findFirst({
    where: {
      id: taxCodeId,
      companyId,
      company: { organizationId },
    },
  });
}
