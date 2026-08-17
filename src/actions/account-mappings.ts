"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageAccountMappings } from "@/lib/rbac";
import { createAccountMappingSchema, updateAccountMappingSchema } from "@/lib/validations";
import {
  createAccountMapping,
  updateAccountMapping,
  listAccountMappings,
  getAccountMapping,
  activateAccountMapping,
  deactivateAccountMapping,
  deleteAccountMapping,
  type AccountMappingResult,
} from "@/mapping/account-mappings";
import type { AccountMapping, MappingSourceType } from "@prisma/client";

/**
 * These are the auth/validation entry points a future account-mapping UI
 * will call. Each one: requires a signed-in user + active organization,
 * checks the role can manage account mappings, validates input with zod,
 * then delegates to src/mapping/account-mappings.ts — which re-checks
 * ownership itself rather than trusting this layer alone. Same shape as
 * src/actions/tax-codes.ts / src/actions/accounts.ts.
 */

export async function createAccountMappingAction(input: {
  companyId: string;
  name: string;
  sourceType: MappingSourceType;
  sourceValue: string;
  accountId?: string;
  taxCodeId?: string;
  priority?: number;
}): Promise<AccountMappingResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccountMappings(role)) {
    return { ok: false, error: "You don't have permission to manage account mappings." };
  }

  const parsed = createAccountMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await createAccountMapping(organization.id, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/account-mapping`);
    revalidatePath(`/companies/${parsed.data.companyId}/settings/account-mapping`);
  }

  return result;
}

export async function updateAccountMappingAction(
  mappingId: string,
  input: {
    companyId: string;
    name: string;
    sourceType: MappingSourceType;
    sourceValue: string;
    accountId?: string;
    taxCodeId?: string;
    priority?: number;
  }
): Promise<AccountMappingResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccountMappings(role)) {
    return { ok: false, error: "You don't have permission to manage account mappings." };
  }

  const parsed = updateAccountMappingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateAccountMapping(organization.id, mappingId, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/account-mapping`);
    revalidatePath(`/companies/${parsed.data.companyId}/settings/account-mapping`);
  }

  return result;
}

export async function listAccountMappingsAction(
  companyId: string,
  filters?: { sourceType?: MappingSourceType; isActive?: boolean }
): Promise<AccountMapping[] | null> {
  const { organization } = await requireActiveOrganization();
  return listAccountMappings(organization.id, companyId, filters);
}

export async function getAccountMappingAction(
  companyId: string,
  mappingId: string
): Promise<AccountMapping | null> {
  const { organization } = await requireActiveOrganization();
  return getAccountMapping(organization.id, companyId, mappingId);
}

export async function setAccountMappingActiveAction(
  companyId: string,
  mappingId: string,
  isActive: boolean
): Promise<AccountMappingResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccountMappings(role)) {
    return { ok: false, error: "You don't have permission to manage account mappings." };
  }

  const result = isActive
    ? await activateAccountMapping(organization.id, companyId, mappingId)
    : await deactivateAccountMapping(organization.id, companyId, mappingId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/dashboard/account-mapping`);
    revalidatePath(`/companies/${companyId}/settings/account-mapping`);
  }

  return result;
}

export async function deleteAccountMappingAction(
  companyId: string,
  mappingId: string
): Promise<AccountMappingResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageAccountMappings(role)) {
    return { ok: false, error: "You don't have permission to manage account mappings." };
  }

  const result = await deleteAccountMapping(organization.id, companyId, mappingId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/dashboard/account-mapping`);
    revalidatePath(`/companies/${companyId}/settings/account-mapping`);
  }

  return result;
}
