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
// Account Mapping (Phase 3C-1)
// ------------------------------

export const mappingSourceTypeSchema = z.enum([
  "BANK_DESCRIPTION",
  "VENDOR",
  "CUSTOMER",
  "CATEGORY",
  "TRANSACTION_TYPE",
]);
export type MappingSourceTypeInput = z.infer<typeof mappingSourceTypeSchema>;

// Same "" -> undefined treatment as optionalId above (accountId / taxCodeId
// come from optional pickers in a future form) — a mapping needs at least
// one of the two, which is checked in src/mapping/account-mappings.ts
// since it depends on both fields together, not something zod alone can
// express here.
const accountMappingBaseSchema = {
  companyId: z.string().trim().min(1, "companyId is required"),
  name: z.string().trim().min(1, "Mapping name is required").max(120),
  sourceType: mappingSourceTypeSchema,
  sourceValue: z.string().trim().min(1, "Source value is required").max(200),
  accountId: optionalId,
  taxCodeId: optionalId,
  priority: z.coerce.number().int().default(0),
};

export const createAccountMappingSchema = z.object(accountMappingBaseSchema);
export type CreateAccountMappingInput = z.infer<typeof createAccountMappingSchema>;

export const updateAccountMappingSchema = z.object(accountMappingBaseSchema);
export type UpdateAccountMappingInput = z.infer<typeof updateAccountMappingSchema>;

export type AccountMappingFieldErrors = Partial<Record<keyof CreateAccountMappingInput, string>>;

// ------------------------------
// Journal Entries (Phase 4A-1)
// ------------------------------

export const journalEntryStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "READY_FOR_POSTING", "POSTED", "VOID"]);
export type JournalEntryStatusInput = z.infer<typeof journalEntryStatusSchema>;

export const journalEntrySourceTypeSchema = z.enum(["MANUAL", "IMPORT", "AI", "BANK", "OTHER"]);
export type JournalEntrySourceTypeInput = z.infer<typeof journalEntrySourceTypeSchema>;

// Money amounts as decimal strings/numbers — z.coerce.number() would lose
// precision the same way a float column would (spec section 8), so this
// keeps the value as a string and only checks its shape; the actual
// Prisma.Decimal math happens server-side in
// src/accounting/journal-entries.ts, never here.
const decimalAmountSchema = z
  .union([z.string(), z.number()])
  .refine((v) => {
    const raw = `${v}`.trim();
    return /^(?:0|[0-9]{1,15})(?:\.[0-9]{1,4})?$/.test(raw);
  }, { message: "Enter a valid amount" })
  .refine((v) => !`${v}`.trim().startsWith("-"), {
    message: "Amount cannot be negative",
  });

export const journalEntryLineSchema = z.object({
  lineId: optionalId,
  accountId: z.string().trim().min(1, "Account is required"),
  taxCodeId: optionalId,
  description: optionalTrimmed(500),
  reference: optionalTrimmed(100),
  debit: decimalAmountSchema,
  credit: decimalAmountSchema,
});
export type JournalEntryLineFormInput = z.infer<typeof journalEntryLineSchema>;

const journalEntryBaseSchema = {
  companyId: z.string().trim().min(1, "companyId is required"),
  fiscalYearId: z.string().trim().min(1, "Fiscal year is required"),
  accountingPeriodId: z.string().trim().min(1, "Accounting period is required"),
  entryNumber: z.string().trim().min(1, "Entry number is required").max(50),
  entryDate: z.coerce.date({ invalid_type_error: "Enter a valid entry date" }),
  reference: optionalTrimmed(100),
  description: optionalTrimmed(500),
  label: optionalTrimmed(120),
  sourceType: journalEntrySourceTypeSchema.default("MANUAL"),
  // Phase 4A-2 (basic Journal Entry UI) intentionally saves a Draft with
  // no lines at all — the complete Debit/Credit line entry system and
  // balance validation are Phase 4A-3. `lines` therefore defaults to an
  // empty array here rather than requiring at least one, but the shape
  // (and validateLineAmounts in src/accounting/journal-entries.ts) still
  // applies fully whenever lines *are* provided, so this schema keeps
  // working unchanged once 4A-3 starts sending real lines.
  lines: z.array(journalEntryLineSchema).default([]),
};

export const createJournalEntrySchema = z.object(journalEntryBaseSchema);
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

export const updateJournalEntrySchema = z.object(journalEntryBaseSchema);
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;

export type JournalEntryFieldErrors = Partial<Record<keyof CreateJournalEntryInput, string>>;

export const setJournalEntryStatusSchema = z.object({
  companyId: z.string().trim().min(1, "companyId is required"),
  status: journalEntryStatusSchema,
});
export type SetJournalEntryStatusInput = z.infer<typeof setJournalEntryStatusSchema>;

// ------------------------------
// Journal Entries — basic header editing (Phase 4A-2)
// ------------------------------

// A DRAFT journal entry's header fields, editable from the basic Edit
// screen (spec section 10). Deliberately narrower than
// updateJournalEntrySchema above: no `entryNumber` (not in the editable
// field list) and no `lines` (Phase 4A-3 owns line editing). Kept as its
// own schema rather than `.pick()`ing from journalEntryBaseSchema so the
// two can evolve independently once 4A-3 adds real line editing to the
// full update schema.
export const updateJournalEntryHeaderSchema = z.object({
  companyId: z.string().trim().min(1, "companyId is required"),
  fiscalYearId: z.string().trim().min(1, "Fiscal year is required"),
  accountingPeriodId: z.string().trim().min(1, "Accounting period is required"),
  entryDate: z.coerce.date({ invalid_type_error: "Enter a valid entry date" }),
  reference: optionalTrimmed(100),
  description: optionalTrimmed(500),
  label: optionalTrimmed(120),
  sourceType: journalEntrySourceTypeSchema.default("MANUAL"),
});
export type UpdateJournalEntryHeaderInput = z.infer<typeof updateJournalEntryHeaderSchema>;

// ------------------------------
// Journal Entries — header + journal lines editing (Phase 4A-3A)
// ------------------------------

// The Edit Draft screen's full write path (spec section 15): the same
// editable header fields as updateJournalEntryHeaderSchema, plus `lines`
// (reusing journalEntryLineSchema — the exact shape createJournalEntrySchema
// already validates lines with, so a line is never validated two different
// ways depending on whether it came from New or Edit). Still no
// `entryNumber`, since it's still not editable (spec section 10).
export const updateJournalEntryWithLinesSchema = updateJournalEntryHeaderSchema.extend({
  expectedVersion: z.coerce.number().int().positive().optional(),
  lines: z.array(journalEntryLineSchema).default([]),
});
export type UpdateJournalEntryWithLinesInput = z.infer<typeof updateJournalEntryWithLinesSchema>;

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
