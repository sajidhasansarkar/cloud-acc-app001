import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { TaxCode, TaxType, CalculationMethod } from "@prisma/client";
import { getOwnedCompany, getOwnedTaxCode } from "./access";

export type TaxCodeResult =
  | { ok: true; taxCode: TaxCode }
  | { ok: false; error: string };

export type CreateTaxCodeInput = {
  companyId: string;
  countryCode: string;
  code: string;
  name: string;
  taxType: TaxType;
  calculationMethod: CalculationMethod;
  rate: number | string | Prisma.Decimal;
  isRecoverable?: boolean;
};

export type UpdateTaxCodeInput = {
  companyId: string;
  countryCode: string;
  code: string;
  name: string;
  taxType: TaxType;
  calculationMethod: CalculationMethod;
  rate: number | string | Prisma.Decimal;
  isRecoverable?: boolean;
};

/**
 * The one rate/method invariant this phase enforces (spec section 3: "Do
 * not implement complex tax calculations yet" — this is a data-integrity
 * check, not a calculation):
 *  - ZERO_RATE / EXEMPT / OUT_OF_SCOPE codes must carry a 0 rate, since
 *    nothing is actually charged under them.
 *  - STANDARD_RATE codes must carry a rate greater than 0 — a "standard
 *    rate" of 0 isn't meaningful and almost certainly means ZERO_RATE was
 *    intended instead.
 * Returns an error string, or null if the combination is valid.
 */
function validateRateForMethod(
  calculationMethod: CalculationMethod,
  rate: Prisma.Decimal
): string | null {
  const isZero = rate.isZero();

  if (calculationMethod === "STANDARD_RATE" && isZero) {
    return "Standard-rate tax codes must have a rate greater than 0.";
  }
  if (calculationMethod !== "STANDARD_RATE" && !isZero) {
    return "Zero-rated, exempt, and out-of-scope tax codes must have a rate of 0.";
  }
  return null;
}

/**
 * Creates a tax code for a company.
 *
 * - Re-verifies the company belongs to the caller's organization.
 * - Validates the rate/calculationMethod invariant above.
 * - Relies on the `@@unique([companyId, code])` constraint for the
 *   "tax code unique per company" rule, with a friendlier pre-check first
 *   (same pattern as createAccount).
 */
export async function createTaxCode(
  organizationId: string,
  input: CreateTaxCodeInput
): Promise<TaxCodeResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  const countryCode = input.countryCode.trim().toUpperCase();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!countryCode) return { ok: false, error: "Country is required." };
  if (!code) return { ok: false, error: "Tax code is required." };
  if (!name) return { ok: false, error: "Tax code name is required." };

  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(input.rate);
  } catch {
    return { ok: false, error: "Rate must be a valid number." };
  }
  if (rate.isNegative()) {
    return { ok: false, error: "Rate cannot be negative." };
  }

  const rateError = validateRateForMethod(input.calculationMethod, rate);
  if (rateError) {
    return { ok: false, error: rateError };
  }

  const existing = await prisma.taxCode.findFirst({
    where: { companyId: company.id, code },
  });
  if (existing) {
    return { ok: false, error: `Tax code "${code}" is already in use for this company.` };
  }

  try {
    const taxCode = await prisma.taxCode.create({
      data: {
        companyId: company.id,
        countryCode,
        code,
        name,
        taxType: input.taxType,
        calculationMethod: input.calculationMethod,
        rate,
        isRecoverable: input.isRecoverable ?? true,
      },
    });
    return { ok: true, taxCode };
  } catch {
    // Most likely the @@unique([companyId, code]) constraint (race with the
    // pre-check above).
    return { ok: false, error: `Tax code "${code}" is already in use for this company.` };
  }
}

/**
 * Lists tax codes for a company, ordered by code. Returns null if the
 * company doesn't exist / doesn't belong to the caller's organization.
 * Optional filters mirror the fields callers will realistically narrow by
 * once a UI exists — none of them are required.
 */
export async function listTaxCodes(
  organizationId: string,
  companyId: string,
  filters?: { countryCode?: string; taxType?: TaxType; isActive?: boolean }
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  return prisma.taxCode.findMany({
    where: {
      companyId: company.id,
      ...(filters?.countryCode ? { countryCode: filters.countryCode.toUpperCase() } : {}),
      ...(filters?.taxType ? { taxType: filters.taxType } : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Fetches a single tax code scoped to the caller's organization + company.
 */
export async function getTaxCode(organizationId: string, companyId: string, taxCodeId: string) {
  return getOwnedTaxCode(organizationId, companyId, taxCodeId);
}

/**
 * Updates a tax code's fields.
 *
 * - Re-verifies the tax code belongs to companyId, which belongs to the
 *   caller's organization.
 * - Re-validates the rate/calculationMethod invariant.
 * - Enforces the unique-code-per-company rule the same way createTaxCode
 *   does.
 */
export async function updateTaxCode(
  organizationId: string,
  taxCodeId: string,
  input: UpdateTaxCodeInput
): Promise<TaxCodeResult> {
  const existing = await getOwnedTaxCode(organizationId, input.companyId, taxCodeId);
  if (!existing) {
    return { ok: false, error: "Tax code not found." };
  }

  const countryCode = input.countryCode.trim().toUpperCase();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!countryCode) return { ok: false, error: "Country is required." };
  if (!code) return { ok: false, error: "Tax code is required." };
  if (!name) return { ok: false, error: "Tax code name is required." };

  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(input.rate);
  } catch {
    return { ok: false, error: "Rate must be a valid number." };
  }
  if (rate.isNegative()) {
    return { ok: false, error: "Rate cannot be negative." };
  }

  const rateError = validateRateForMethod(input.calculationMethod, rate);
  if (rateError) {
    return { ok: false, error: rateError };
  }

  const codeConflict = await prisma.taxCode.findFirst({
    where: { companyId: existing.companyId, code, id: { not: existing.id } },
  });
  if (codeConflict) {
    return { ok: false, error: `Tax code "${code}" is already in use for this company.` };
  }

  try {
    const taxCode = await prisma.taxCode.update({
      where: { id: existing.id },
      data: {
        countryCode,
        code,
        name,
        taxType: input.taxType,
        calculationMethod: input.calculationMethod,
        rate,
        isRecoverable: input.isRecoverable ?? existing.isRecoverable,
      },
    });
    return { ok: true, taxCode };
  } catch {
    return { ok: false, error: `Tax code "${code}" is already in use for this company.` };
  }
}

/**
 * Activates or deactivates a tax code. Inactive tax codes are never
 * deleted — they remain stored intact (same rationale as
 * setAccountActive) so anything that references one later keeps working;
 * this just flips the flag a future UI uses to hide them from pickers.
 */
export async function setTaxCodeActive(
  organizationId: string,
  companyId: string,
  taxCodeId: string,
  isActive: boolean
): Promise<TaxCodeResult> {
  const existing = await getOwnedTaxCode(organizationId, companyId, taxCodeId);
  if (!existing) {
    return { ok: false, error: "Tax code not found." };
  }

  const taxCode = await prisma.taxCode.update({
    where: { id: existing.id },
    data: { isActive },
  });
  return { ok: true, taxCode };
}

export const activateTaxCode = (organizationId: string, companyId: string, taxCodeId: string) =>
  setTaxCodeActive(organizationId, companyId, taxCodeId, true);

export const deactivateTaxCode = (organizationId: string, companyId: string, taxCodeId: string) =>
  setTaxCodeActive(organizationId, companyId, taxCodeId, false);
