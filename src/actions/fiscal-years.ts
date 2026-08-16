"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageFiscalYears } from "@/lib/rbac";
import { createFiscalYearSchema, periodStatusSchema } from "@/lib/validations";
import {
  createFiscalYear,
  updateFiscalYear,
  getCurrentFiscalYear,
  setFiscalYearStatus,
  type FiscalYearResult,
} from "@/accounting/fiscal-years";
import type { FiscalYear } from "@prisma/client";

/**
 * These are the auth/validation entry points Phase 2B-2's UI will call.
 * Each one: requires a signed-in user + active organization, checks the
 * role can manage fiscal years, validates input with zod, then delegates
 * to src/accounting/fiscal-years.ts — which re-checks ownership itself
 * rather than trusting this layer alone.
 */

export async function createFiscalYearAction(input: {
  companyId: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
}): Promise<FiscalYearResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageFiscalYears(role)) {
    return { ok: false, error: "You don't have permission to manage fiscal years." };
  }

  const parsed = createFiscalYearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await createFiscalYear(organization.id, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
  }

  return result;
}

export async function updateFiscalYearAction(input: {
  companyId: string;
  fiscalYearId: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
}): Promise<FiscalYearResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageFiscalYears(role)) {
    return { ok: false, error: "You don't have permission to manage fiscal years." };
  }

  if (!input.fiscalYearId) {
    return { ok: false, error: "fiscalYearId is required." };
  }

  // Reuses the create schema — the field shape (companyId, name, startDate,
  // endDate) is identical, so there's no reason to duplicate the same zod
  // rules in a second schema just because this is an edit.
  const parsed = createFiscalYearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateFiscalYear(organization.id, input.fiscalYearId, parsed.data);

  if (result.ok) {
    revalidatePath(`/companies/${parsed.data.companyId}/settings/fiscal-period`);
    revalidatePath(`/companies/${parsed.data.companyId}/settings/fiscal-period/${input.fiscalYearId}`);
  }

  return result;
}

export async function getCurrentFiscalYearAction(companyId: string): Promise<FiscalYear | null> {
  const { organization } = await requireActiveOrganization();
  return getCurrentFiscalYear(organization.id, companyId);
}

export async function setFiscalYearStatusAction(
  companyId: string,
  fiscalYearId: string,
  status: "OPEN" | "CLOSED" | "LOCKED"
): Promise<FiscalYearResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageFiscalYears(role)) {
    return { ok: false, error: "You don't have permission to manage fiscal years." };
  }

  const parsedStatus = periodStatusSchema.safeParse(status);
  if (!parsedStatus.success) {
    return { ok: false, error: "Invalid status." };
  }

  const result = await setFiscalYearStatus(organization.id, companyId, fiscalYearId, parsedStatus.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
  }

  return result;
}
