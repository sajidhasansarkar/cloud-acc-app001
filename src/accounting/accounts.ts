import { prisma } from "@/lib/prisma";
import type { Account, AccountType } from "@prisma/client";
import { getOwnedCompany, getOwnedAccount } from "./access";

export type AccountResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

export type CreateAccountInput = {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  type: AccountType;
  subtype?: string;
  parentAccountId?: string;
  isSystemAccount?: boolean;
};

/**
 * Resolves a parent account for `companyId`, verifying it belongs to the
 * same company (an account can never be parented to another company's
 * account — spec section 8). Returns:
 *  - { ok: true, parent: null }              — no parent requested
 *  - { ok: true, parent: Account }           — a valid same-company parent
 *  - { ok: false, error }                    — parent missing / wrong company
 */
async function resolveParent(companyId: string, parentAccountId: string | undefined) {
  if (!parentAccountId) {
    return { ok: true as const, parent: null };
  }
  const parent = await prisma.account.findFirst({
    where: { id: parentAccountId, companyId },
  });
  if (!parent) {
    return { ok: false as const, error: "Parent account not found for this company." };
  }
  return { ok: true as const, parent };
}

/**
 * True if `candidateParentId` is `accountId` itself, or a descendant of
 * `accountId` — i.e. making it the parent would create a cycle. Walks
 * upward from the candidate parent through its own parent chain; if it
 * ever reaches `accountId`, a cycle would be created.
 */
async function wouldCreateCycle(accountId: string, candidateParentId: string): Promise<boolean> {
  if (candidateParentId === accountId) return true;

  let currentId: string | null = candidateParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === accountId) return true;
    if (visited.has(currentId)) return true; // pre-existing cycle safety net
    visited.add(currentId);

    const current: { parentAccountId: string | null } | null = await prisma.account.findUnique({
      where: { id: currentId },
      select: { parentAccountId: true },
    });
    currentId = current?.parentAccountId ?? null;
  }
  return false;
}

/**
 * Creates a chart-of-accounts account for a company.
 *
 * - Re-verifies the company belongs to the caller's organization.
 * - Rejects a parentAccountId that doesn't exist / belongs to a different
 *   company.
 * - Relies on the `@@unique([companyId, code])` constraint for the
 *   "account code unique per company" rule (spec section 5), with a
 *   friendlier pre-check first.
 */
export async function createAccount(
  organizationId: string,
  input: CreateAccountInput
): Promise<AccountResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Account code is required." };
  if (!name) return { ok: false, error: "Account name is required." };

  const parentResult = await resolveParent(company.id, input.parentAccountId);
  if (!parentResult.ok) {
    return { ok: false, error: parentResult.error };
  }

  const existing = await prisma.account.findFirst({
    where: { companyId: company.id, code },
  });
  if (existing) {
    return { ok: false, error: `Account code "${code}" is already in use for this company.` };
  }

  try {
    const account = await prisma.account.create({
      data: {
        companyId: company.id,
        code,
        name,
        description: input.description?.trim() || undefined,
        type: input.type,
        subtype: input.subtype?.trim() || undefined,
        parentAccountId: parentResult.parent?.id,
        isSystemAccount: input.isSystemAccount ?? false,
      },
    });
    return { ok: true, account };
  } catch {
    // Most likely the @@unique([companyId, code]) constraint (race with the
    // pre-check above).
    return { ok: false, error: `Account code "${code}" is already in use for this company.` };
  }
}

/**
 * Lists every account for a company, ordered by code. Returns null if the
 * company doesn't exist / doesn't belong to the caller's organization.
 */
export async function listAccounts(organizationId: string, companyId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  return prisma.account.findMany({
    where: { companyId: company.id },
    orderBy: { code: "asc" },
  });
}

/**
 * Fetches a single account scoped to the caller's organization + company.
 */
export async function getAccount(organizationId: string, companyId: string, accountId: string) {
  return getOwnedAccount(organizationId, companyId, accountId);
}

export type UpdateAccountInput = {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  type: AccountType;
  subtype?: string;
  parentAccountId?: string;
};

/**
 * Updates an account's core fields and/or reparents it.
 *
 * - Re-verifies the account belongs to companyId, which belongs to the
 *   caller's organization.
 * - Rejects a parentAccountId that doesn't exist / belongs to a different
 *   company, is the account itself, or is one of the account's own
 *   descendants (which would create a cycle).
 * - Enforces the unique-code-per-company rule the same way createAccount
 *   does.
 */
export async function updateAccount(
  organizationId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<AccountResult> {
  const existing = await getOwnedAccount(organizationId, input.companyId, accountId);
  if (!existing) {
    return { ok: false, error: "Account not found." };
  }

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "Account code is required." };
  if (!name) return { ok: false, error: "Account name is required." };

  const parentResult = await resolveParent(existing.companyId, input.parentAccountId);
  if (!parentResult.ok) {
    return { ok: false, error: parentResult.error };
  }

  if (parentResult.parent) {
    if (await wouldCreateCycle(existing.id, parentResult.parent.id)) {
      return { ok: false, error: "An account cannot be its own ancestor." };
    }
  }

  const codeConflict = await prisma.account.findFirst({
    where: { companyId: existing.companyId, code, id: { not: existing.id } },
  });
  if (codeConflict) {
    return { ok: false, error: `Account code "${code}" is already in use for this company.` };
  }

  try {
    const account = await prisma.account.update({
      where: { id: existing.id },
      data: {
        code,
        name,
        description: input.description?.trim() || null,
        type: input.type,
        subtype: input.subtype?.trim() || null,
        parentAccountId: parentResult.parent?.id ?? null,
      },
    });
    return { ok: true, account };
  } catch {
    return { ok: false, error: `Account code "${code}" is already in use for this company.` };
  }
}

/**
 * Activates or deactivates an account. Inactive accounts are never
 * deleted — they remain stored with all their history intact (spec
 * section 6); this just flips the flag that later phases/UI use to hide
 * them from normal pickers.
 */
export async function setAccountActive(
  organizationId: string,
  companyId: string,
  accountId: string,
  isActive: boolean
): Promise<AccountResult> {
  const existing = await getOwnedAccount(organizationId, companyId, accountId);
  if (!existing) {
    return { ok: false, error: "Account not found." };
  }

  const account = await prisma.account.update({
    where: { id: existing.id },
    data: { isActive },
  });
  return { ok: true, account };
}

export const activateAccount = (organizationId: string, companyId: string, accountId: string) =>
  setAccountActive(organizationId, companyId, accountId, true);

export const deactivateAccount = (organizationId: string, companyId: string, accountId: string) =>
  setAccountActive(organizationId, companyId, accountId, false);
