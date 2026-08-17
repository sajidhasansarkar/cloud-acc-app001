import { prisma } from "@/lib/prisma";

// Reused as-is: "a company scoped to the caller's organization" is the
// same lookup regardless of which module needs it — see the comment on
// getOwnedCompany in src/accounting/access.ts for the full rationale.
export { getOwnedCompany, getOwnedAccount } from "@/accounting/access";

// Reused as-is from the tax module for the same reason.
export { getOwnedTaxCode } from "@/tax/access";

/**
 * Ownership-chain lookups for the account-mapping module (Phase 3C-1).
 *
 * Same rule as src/accounting/access.ts and src/tax/access.ts, applied to
 * account mappings: Authenticated User → Organization → Company →
 * AccountMapping. A bare id coming from the caller (companyId,
 * mappingId) is never trusted on its own — every read/write re-derives
 * ownership from the caller's organizationId first. This is the single
 * place that does that, so every function in account-mappings.ts uses the
 * same rule instead of re-implementing it slightly differently.
 */

// An account mapping scoped to a specific company, which itself must
// belong to the caller's organization. Both hops are checked in one
// query.
export async function getOwnedAccountMapping(
  organizationId: string,
  companyId: string,
  mappingId: string
) {
  return prisma.accountMapping.findFirst({
    where: {
      id: mappingId,
      companyId,
      company: { organizationId },
    },
  });
}
