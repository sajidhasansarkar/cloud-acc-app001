import { prisma } from "@/lib/prisma";
import type { AccountMapping, MappingSourceType } from "@prisma/client";
import { getOwnedCompany, getOwnedAccount, getOwnedTaxCode, getOwnedAccountMapping } from "./access";

export type AccountMappingResult =
  | { ok: true; mapping: AccountMapping }
  | { ok: false; error: string };

export type CreateAccountMappingInput = {
  companyId: string;
  name: string;
  sourceType: MappingSourceType;
  sourceValue: string;
  accountId?: string;
  taxCodeId?: string;
  priority?: number;
};

export type UpdateAccountMappingInput = CreateAccountMappingInput;

/**
 * Resolves and validates the accountId / taxCodeId a mapping should route
 * to, given they've already been confirmed non-empty strings by the
 * caller's basic field checks:
 *  - Either may be omitted, but at least one of the two must be present —
 *    a mapping that routes to neither does nothing (spec section 2: "Ensure
 *    referenced records belong to the same company").
 *  - Whichever is present must exist and belong to `companyId` — cross-
 *    company references are rejected here (spec section 4).
 * Returns `{ ok: false, error }` on any violation, otherwise the two
 * resolved (or null) ids to persist.
 */
async function resolveTargets(
  organizationId: string,
  companyId: string,
  accountId: string | undefined,
  taxCodeId: string | undefined
): Promise<
  | { ok: true; accountId: string | null; taxCodeId: string | null }
  | { ok: false; error: string }
> {
  if (!accountId && !taxCodeId) {
    return { ok: false, error: "A mapping must reference an account, a tax code, or both." };
  }

  let resolvedAccountId: string | null = null;
  if (accountId) {
    const account = await getOwnedAccount(organizationId, companyId, accountId);
    if (!account) {
      return { ok: false, error: "Account not found for this company." };
    }
    resolvedAccountId = account.id;
  }

  let resolvedTaxCodeId: string | null = null;
  if (taxCodeId) {
    const taxCode = await getOwnedTaxCode(organizationId, companyId, taxCodeId);
    if (!taxCode) {
      return { ok: false, error: "Tax code not found for this company." };
    }
    resolvedTaxCodeId = taxCode.id;
  }

  return { ok: true, accountId: resolvedAccountId, taxCodeId: resolvedTaxCodeId };
}

/**
 * Creates an account-mapping rule for a company.
 *
 * - Re-verifies the company belongs to the caller's organization.
 * - Rejects an accountId / taxCodeId that doesn't exist or belongs to a
 *   different company (spec section 4: prevent cross-company mappings),
 *   and requires at least one of the two.
 * - Does not evaluate sourceValue against anything or perform any
 *   matching — that's explicitly out of scope for this phase (spec
 *   section 3).
 */
export async function createAccountMapping(
  organizationId: string,
  input: CreateAccountMappingInput
): Promise<AccountMappingResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  const name = input.name.trim();
  const sourceValue = input.sourceValue.trim();
  if (!name) return { ok: false, error: "Mapping name is required." };
  if (!sourceValue) return { ok: false, error: "Source value is required." };

  const targets = await resolveTargets(organizationId, company.id, input.accountId, input.taxCodeId);
  if (!targets.ok) {
    return { ok: false, error: targets.error };
  }

  const mapping = await prisma.accountMapping.create({
    data: {
      companyId: company.id,
      name,
      sourceType: input.sourceType,
      sourceValue,
      accountId: targets.accountId,
      taxCodeId: targets.taxCodeId,
      priority: input.priority ?? 0,
    },
  });
  return { ok: true, mapping };
}

/**
 * Lists account-mapping rules for a company, ordered by priority
 * (highest first) then name. Returns null if the company doesn't exist /
 * doesn't belong to the caller's organization. Optional filters mirror
 * the fields a future UI will realistically narrow by — none required.
 */
export async function listAccountMappings(
  organizationId: string,
  companyId: string,
  filters?: { sourceType?: MappingSourceType; isActive?: boolean }
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  return prisma.accountMapping.findMany({
    where: {
      companyId: company.id,
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });
}

/**
 * Fetches a single account-mapping rule scoped to the caller's
 * organization + company.
 */
export async function getAccountMapping(organizationId: string, companyId: string, mappingId: string) {
  return getOwnedAccountMapping(organizationId, companyId, mappingId);
}

/**
 * Updates an account-mapping rule's fields.
 *
 * - Re-verifies the mapping belongs to companyId, which belongs to the
 *   caller's organization.
 * - Re-validates the accountId / taxCodeId / same-company rules the same
 *   way createAccountMapping does.
 */
export async function updateAccountMapping(
  organizationId: string,
  mappingId: string,
  input: UpdateAccountMappingInput
): Promise<AccountMappingResult> {
  const existing = await getOwnedAccountMapping(organizationId, input.companyId, mappingId);
  if (!existing) {
    return { ok: false, error: "Mapping not found." };
  }

  const name = input.name.trim();
  const sourceValue = input.sourceValue.trim();
  if (!name) return { ok: false, error: "Mapping name is required." };
  if (!sourceValue) return { ok: false, error: "Source value is required." };

  const targets = await resolveTargets(
    organizationId,
    existing.companyId,
    input.accountId,
    input.taxCodeId
  );
  if (!targets.ok) {
    return { ok: false, error: targets.error };
  }

  const mapping = await prisma.accountMapping.update({
    where: { id: existing.id },
    data: {
      name,
      sourceType: input.sourceType,
      sourceValue,
      accountId: targets.accountId,
      taxCodeId: targets.taxCodeId,
      priority: input.priority ?? existing.priority,
    },
  });
  return { ok: true, mapping };
}

/**
 * Activates or deactivates an account-mapping rule. Inactive mappings are
 * never deleted — they remain stored intact (same rationale as
 * setAccountActive / setTaxCodeActive) so a future matching engine and
 * audit history keep working; this just flips the flag a future UI uses
 * to hide them from normal pickers.
 */
export async function setAccountMappingActive(
  organizationId: string,
  companyId: string,
  mappingId: string,
  isActive: boolean
): Promise<AccountMappingResult> {
  const existing = await getOwnedAccountMapping(organizationId, companyId, mappingId);
  if (!existing) {
    return { ok: false, error: "Mapping not found." };
  }

  const mapping = await prisma.accountMapping.update({
    where: { id: existing.id },
    data: { isActive },
  });
  return { ok: true, mapping };
}

export const activateAccountMapping = (
  organizationId: string,
  companyId: string,
  mappingId: string
) => setAccountMappingActive(organizationId, companyId, mappingId, true);

export const deactivateAccountMapping = (
  organizationId: string,
  companyId: string,
  mappingId: string
) => setAccountMappingActive(organizationId, companyId, mappingId, false);

/**
 * Whether a mapping is safe to hard-delete. Nothing in the schema yet
 * references an AccountMapping row (no transactions, bank import, or
 * journal entries exist in this phase — see spec's "DO NOT IMPLEMENT"
 * section), so this always returns false today. It's kept as its own
 * function, checked before every delete, so a later phase that adds a
 * real referencing table only has to extend this one place rather than
 * hunt down every delete call site.
 */
async function isAccountMappingReferenced(_mappingId: string): Promise<boolean> {
  return false;
}

/**
 * Deletes an account-mapping rule outright. Deactivation
 * (setAccountMappingActive) is the preferred way to retire a mapping —
 * this is only for removing one that was never valid (e.g. created by
 * mistake). Refuses when the mapping is referenced elsewhere
 * (isAccountMappingReferenced) so a hard delete can never silently break
 * something that depends on it; the caller should deactivate instead in
 * that case.
 */
export async function deleteAccountMapping(
  organizationId: string,
  companyId: string,
  mappingId: string
): Promise<AccountMappingResult> {
  const existing = await getOwnedAccountMapping(organizationId, companyId, mappingId);
  if (!existing) {
    return { ok: false, error: "Mapping not found." };
  }

  if (await isAccountMappingReferenced(existing.id)) {
    return {
      ok: false,
      error: "This mapping is referenced elsewhere and can't be deleted. Deactivate it instead.",
    };
  }

  await prisma.accountMapping.delete({ where: { id: existing.id } });
  return { ok: true, mapping: existing };
}
