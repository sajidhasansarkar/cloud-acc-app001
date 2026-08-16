"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageAccounts } from "@/lib/rbac";
import { createAccountSchema, updateAccountSchema } from "@/lib/validations";
import {
  createAccount,
  updateAccount,
  listAccounts,
  getAccount,
  activateAccount,
  deactivateAccount,
  type AccountResult,
} from "@/accounting/accounts";
import type { Account, AccountType } from "@prisma/client";

/**
 * These are the auth/validation entry points Phase 3A-2's UI will call.
 * Each one: requires a signed-in user + active organization, checks the
 * role can manage accounts, validates input with zod, then delegates to
 * src/accounting/accounts.ts — which re-checks ownership itself rather
 * than trusting this layer alone. Same shape as src/actions/fiscal-years.ts.
 */

export async function createAccountAction(input: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  type: AccountType;
  subtype?: string;
  parentAccountId?: string;
}): Promise<AccountResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccounts(role)) {
    return { ok: false, error: "You don't have permission to manage the chart of accounts." };
  }

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await createAccount(organization.id, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/chart-of-accounts`);
  }

  return result;
}

export async function updateAccountAction(
  accountId: string,
  input: {
    companyId: string;
    code: string;
    name: string;
    description?: string;
    type: AccountType;
    subtype?: string;
    parentAccountId?: string;
  }
): Promise<AccountResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccounts(role)) {
    return { ok: false, error: "You don't have permission to manage the chart of accounts." };
  }

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateAccount(organization.id, accountId, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/chart-of-accounts`);
  }

  return result;
}

export async function listAccountsAction(companyId: string): Promise<Account[] | null> {
  const { organization } = await requireActiveOrganization();
  return listAccounts(organization.id, companyId);
}

export async function getAccountAction(
  companyId: string,
  accountId: string
): Promise<Account | null> {
  const { organization } = await requireActiveOrganization();
  return getAccount(organization.id, companyId, accountId);
}

export async function setAccountActiveAction(
  companyId: string,
  accountId: string,
  isActive: boolean
): Promise<AccountResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccounts(role)) {
    return { ok: false, error: "You don't have permission to manage the chart of accounts." };
  }

  const result = isActive
    ? await activateAccount(organization.id, companyId, accountId)
    : await deactivateAccount(organization.id, companyId, accountId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/dashboard/chart-of-accounts`);
  }

  return result;
}
