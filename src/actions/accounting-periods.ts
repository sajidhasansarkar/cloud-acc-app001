"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageFiscalYears } from "@/lib/rbac";
import { generateAccountingPeriodsSchema, periodStatusSchema } from "@/lib/validations";
import {
  generateAndCreateAccountingPeriods,
  getCurrentAccountingPeriod,
  setAccountingPeriodStatus,
  type GeneratePeriodsResult,
  type AccountingPeriodResult,
} from "@/accounting/accounting-periods";
import type { AccountingPeriod } from "@prisma/client";

export async function generateAccountingPeriodsAction(input: {
  companyId: string;
  fiscalYearId: string;
  frequency: "MONTHLY" | "QUARTERLY";
}): Promise<GeneratePeriodsResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageFiscalYears(role)) {
    return { ok: false, error: "You don't have permission to manage accounting periods." };
  }

  const parsed = generateAccountingPeriodsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await generateAndCreateAccountingPeriods(
    organization.id,
    parsed.data.companyId,
    parsed.data.fiscalYearId,
    parsed.data.frequency
  );

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
  }

  return result;
}

export async function getCurrentAccountingPeriodAction(
  companyId: string
): Promise<AccountingPeriod | null> {
  const { organization } = await requireActiveOrganization();
  return getCurrentAccountingPeriod(organization.id, companyId);
}

export async function setAccountingPeriodStatusAction(
  companyId: string,
  periodId: string,
  status: "OPEN" | "CLOSED" | "LOCKED"
): Promise<AccountingPeriodResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageFiscalYears(role)) {
    return { ok: false, error: "You don't have permission to manage accounting periods." };
  }

  const parsedStatus = periodStatusSchema.safeParse(status);
  if (!parsedStatus.success) {
    return { ok: false, error: "Invalid status." };
  }

  const result = await setAccountingPeriodStatus(organization.id, companyId, periodId, parsedStatus.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
  }

  return result;
}
