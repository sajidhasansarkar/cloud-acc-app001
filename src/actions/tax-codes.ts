"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageTaxCodes } from "@/lib/rbac";
import { createTaxCodeSchema, updateTaxCodeSchema } from "@/lib/validations";
import {
  createTaxCode,
  updateTaxCode,
  listTaxCodes,
  getTaxCode,
  activateTaxCode,
  deactivateTaxCode,
  type TaxCodeResult,
} from "@/tax/tax-codes";
import type { TaxCode, TaxType, CalculationMethod } from "@prisma/client";

/**
 * These are the auth/validation entry points a future tax-codes UI will
 * call. Each one: requires a signed-in user + active organization, checks
 * the role can manage tax codes, validates input with zod, then delegates
 * to src/tax/tax-codes.ts — which re-checks ownership itself rather than
 * trusting this layer alone. Same shape as src/actions/accounts.ts.
 */

export async function createTaxCodeAction(input: {
  companyId: string;
  countryCode: string;
  code: string;
  name: string;
  taxType: TaxType;
  calculationMethod: CalculationMethod;
  rate: number;
  isRecoverable?: boolean;
}): Promise<TaxCodeResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageTaxCodes(role)) {
    return { ok: false, error: "You don't have permission to manage tax codes." };
  }

  const parsed = createTaxCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await createTaxCode(organization.id, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/tax-codes`);
    revalidatePath(`/companies/${parsed.data.companyId}/settings/tax`);
  }

  return result;
}

export async function updateTaxCodeAction(
  taxCodeId: string,
  input: {
    companyId: string;
    countryCode: string;
    code: string;
    name: string;
    taxType: TaxType;
    calculationMethod: CalculationMethod;
    rate: number;
    isRecoverable?: boolean;
  }
): Promise<TaxCodeResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageTaxCodes(role)) {
    return { ok: false, error: "You don't have permission to manage tax codes." };
  }

  const parsed = updateTaxCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateTaxCode(organization.id, taxCodeId, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/dashboard/tax-codes`);
    revalidatePath(`/companies/${parsed.data.companyId}/settings/tax`);
  }

  return result;
}

export async function listTaxCodesAction(
  companyId: string,
  filters?: { countryCode?: string; taxType?: TaxType; isActive?: boolean }
): Promise<TaxCode[] | null> {
  const { organization } = await requireActiveOrganization();
  return listTaxCodes(organization.id, companyId, filters);
}

export async function getTaxCodeAction(
  companyId: string,
  taxCodeId: string
): Promise<TaxCode | null> {
  const { organization } = await requireActiveOrganization();
  return getTaxCode(organization.id, companyId, taxCodeId);
}

export async function setTaxCodeActiveAction(
  companyId: string,
  taxCodeId: string,
  isActive: boolean
): Promise<TaxCodeResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageTaxCodes(role)) {
    return { ok: false, error: "You don't have permission to manage tax codes." };
  }

  const result = isActive
    ? await activateTaxCode(organization.id, companyId, taxCodeId)
    : await deactivateTaxCode(organization.id, companyId, taxCodeId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/dashboard/tax-codes`);
    revalidatePath(`/companies/${companyId}/settings/tax`);
  }

  return result;
}
