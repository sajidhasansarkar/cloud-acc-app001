import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Shared optional-field helper: treats "" as absent, otherwise trims.
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

// Loose but useful phone validator — accepts digits, spaces, and common
// punctuation (+, -, (), .) since business phone formats vary a lot by
// country and we don't want to reject valid international numbers.
const phoneRegex = /^[0-9+\-().\s]{7,20}$/;

const companyBaseSchema = {
  legalName: z.string().trim().min(2, "Legal business name is required").max(200),
  displayName: z.string().trim().min(2, "Display name is required").max(120),
  businessNumber: optionalTrimmed(60),
  address: optionalTrimmed(200),
  city: optionalTrimmed(100),
  stateProvince: optionalTrimmed(100),
  postalCode: optionalTrimmed(20),
  country: z.string().trim().length(2, "Select a country"),
  currency: z.string().trim().length(3, "Select a currency"),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  contactPhone: optionalTrimmed(30).refine(
    (v) => !v || phoneRegex.test(v),
    "Enter a valid phone number"
  ),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
};

export const createCompanySchema = z.object(companyBaseSchema);
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.object(companyBaseSchema);
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export type CompanyFieldErrors = Partial<
  Record<keyof CreateCompanyInput, string>
>;

// ------------------------------
// Fiscal Years / Accounting Periods (Phase 2B-1)
// ------------------------------

// Accepts a Date, or anything Date-parseable (e.g. a "YYYY-MM-DD" string
// coming off a form field / FormData), and normalizes to a Date.
const dateInput = z.coerce.date({ errorMap: () => ({ message: "Enter a valid date" }) });

export const createFiscalYearSchema = z
  .object({
    companyId: z.string().trim().min(1, "companyId is required"),
    name: z.string().trim().min(1, "Name is required").max(120),
    startDate: dateInput,
    endDate: dateInput,
  })
  .refine((data) => data.endDate.getTime() > data.startDate.getTime(), {
    message: "Fiscal year end date must be after the start date.",
    path: ["endDate"],
  });

export type CreateFiscalYearInput = z.infer<typeof createFiscalYearSchema>;

// ------------------------------
// Chart of Accounts (Phase 3A-1)
// ------------------------------

export const accountTypeSchema = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

// Optional trimmed string that treats "" as absent (parentAccountId,
// subtype, description all use this — "no value" and "empty string" from
// a form should mean the same thing).
const optionalId = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

const accountBaseSchema = {
  companyId: z.string().trim().min(1, "companyId is required"),
  code: z.string().trim().min(1, "Account code is required").max(20),
  name: z.string().trim().min(1, "Account name is required").max(120),
  description: optionalTrimmed(500),
  type: accountTypeSchema,
  // Deliberately a free-form string, not an enum — see the Account.subtype
  // comment in prisma/schema.prisma. src/accounting/account-subtypes.ts
  // has suggested values per type for a future dropdown.
  subtype: optionalTrimmed(60),
  parentAccountId: optionalId,
};

export const createAccountSchema = z.object(accountBaseSchema);
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object(accountBaseSchema);
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export type AccountFieldErrors = Partial<Record<keyof CreateAccountInput, string>>;

export const periodFrequencySchema = z.enum(["MONTHLY", "QUARTERLY"]);
export type PeriodFrequencyInput = z.infer<typeof periodFrequencySchema>;

export const generateAccountingPeriodsSchema = z.object({
  companyId: z.string().trim().min(1, "companyId is required"),
  fiscalYearId: z.string().trim().min(1, "fiscalYearId is required"),
  frequency: periodFrequencySchema,
});
export type GenerateAccountingPeriodsInput = z.infer<typeof generateAccountingPeriodsSchema>;

export const periodStatusSchema = z.enum(["OPEN", "CLOSED", "LOCKED"]);
export type PeriodStatusInput = z.infer<typeof periodStatusSchema>;

// ------------------------------
// Tax Codes (Phase 3B-1)
// ------------------------------

export const taxTypeSchema = z.enum(["GST", "HST", "VAT", "SALES_TAX", "OTHER"]);
export type TaxTypeInput = z.infer<typeof taxTypeSchema>;

export const calculationMethodSchema = z.enum([
  "STANDARD_RATE",
  "ZERO_RATE",
  "EXEMPT",
  "OUT_OF_SCOPE",
]);
export type CalculationMethodInput = z.infer<typeof calculationMethodSchema>;

// Rate is a percentage (e.g. 13 for 13%). Accepts a number or a numeric
// string (form inputs arrive as strings) and coerces to a number; the
// rate/calculationMethod consistency check (0 for ZERO_RATE/EXEMPT/
// OUT_OF_SCOPE, >0 for STANDARD_RATE) is enforced in
// src/tax/tax-codes.ts, not here, since it depends on another field.
const taxRateSchema = z.coerce
  .number({ invalid_type_error: "Rate must be a number" })
  .min(0, "Rate cannot be negative")
  .max(100, "Rate cannot exceed 100");

const taxCodeBaseSchema = {
  companyId: z.string().trim().min(1, "companyId is required"),
  countryCode: z.string().trim().length(2, "Select a country"),
  code: z.string().trim().min(1, "Tax code is required").max(20),
  name: z.string().trim().min(1, "Tax code name is required").max(120),
  taxType: taxTypeSchema,
  calculationMethod: calculationMethodSchema,
  rate: taxRateSchema,
  isRecoverable: z.boolean().default(true),
};

export const createTaxCodeSchema = z.object(taxCodeBaseSchema);
export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;

export const updateTaxCodeSchema = z.object(taxCodeBaseSchema);
export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;

export type TaxCodeFieldErrors = Partial<Record<keyof CreateTaxCodeInput, string>>;

// ------------------------------
// Company Settings — Accounting tab (Phase 2B-2B-2)
// ------------------------------

// Reuses periodFrequencySchema (defined above, already the source of truth
// for the period-generation workflow) rather than declaring a second
// MONTHLY/QUARTERLY enum, so the settings form and the generator can never
// accept different value sets.
export const updateAccountingSettingsSchema = z.object({
  companyId: z.string().trim().min(1, "companyId is required"),
  defaultPeriodFrequency: periodFrequencySchema,
});
export type UpdateAccountingSettingsInput = z.infer<typeof updateAccountingSettingsSchema>;

// ------------------------------
// Account / Password
// ------------------------------

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(200, "New password is too long"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from your current password",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangePasswordFieldErrors = Partial<
  Record<"currentPassword" | "newPassword" | "confirmPassword", string>
>;
