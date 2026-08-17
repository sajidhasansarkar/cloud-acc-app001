// Static list used only as a fallback for the initial UI. The
// CountryConfiguration model in the database is the source of truth and is
// designed to be extended later by an ADMIN without a code change — this
// array just mirrors the same four countries requested for Phase 1/2A so
// the form always has options even before/without a DB round trip.
export const INITIAL_COUNTRIES = [
  { countryCode: "CA", countryName: "Canada", currencyCode: "CAD", currencySymbol: "$" },
  { countryCode: "US", countryName: "United States", currencyCode: "USD", currencySymbol: "$" },
  { countryCode: "GB", countryName: "United Kingdom", currencyCode: "GBP", currencySymbol: "£" },
  { countryCode: "AU", countryName: "Australia", currencyCode: "AUD", currencySymbol: "$" },
] as const;

// The full set of statuses that can exist in the database (ONBOARDING is a
// legacy Phase 1 value, kept for backward compatibility with any records
// created before Phase 2A).
export const ALL_COMPANY_STATUSES = ["ACTIVE", "ONBOARDING", "ARCHIVED"] as const;

// The statuses the Phase 2A Create/Edit Company forms expose, per spec.
export const COMPANY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export const COMPANY_STATUS_LABELS: Record<(typeof ALL_COMPANY_STATUSES)[number], string> = {
  ACTIVE: "Active",
  ONBOARDING: "Onboarding",
  ARCHIVED: "Archived",
};

// ------------------------------
// Chart of Accounts (Phase 3A-2)
// ------------------------------

// Mirrors the AccountType enum in prisma/schema.prisma — kept here (rather
// than importing the Prisma enum directly into every client component) so
// UI code has a single, ordered list to drive <Select> options with.
export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

export const ACCOUNT_TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expense",
};

// Account.isActive is a plain boolean (see the schema comment on Account),
// but the UI presents it as a two-value status, matching the spec's
// ACTIVE / INACTIVE vocabulary.
export const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// ------------------------------
// Chart of Accounts — tree, search, filter, sort (Phase 3A-3)
// ------------------------------

// Sibling ordering within the account tree / flat list. Mirrors the
// COMPANY_SORT_OPTIONS pattern below: a single ordered list drives the
// <Select>, and its `value` union is the type the sorting/query code keys
// off of.
export const ACCOUNT_SORT_OPTIONS = [
  { value: "code_asc", label: "Code (A–Z)" },
  { value: "code_desc", label: "Code (Z–A)" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "createdAt_desc", label: "Created (newest)" },
  { value: "createdAt_asc", label: "Created (oldest)" },
] as const;

export type AccountSortKey = (typeof ACCOUNT_SORT_OPTIONS)[number]["value"];

export const DEFAULT_ACCOUNT_SORT: AccountSortKey = "code_asc";

// ------------------------------
// Tax Codes (Phase 3B-2)
// ------------------------------

// Mirrors the TaxType enum in prisma/schema.prisma — same reasoning as
// ACCOUNT_TYPES above: a single ordered list drives every <Select> in the
// UI instead of importing the Prisma enum into client components.
export const TAX_TYPES = ["GST", "HST", "VAT", "SALES_TAX", "OTHER"] as const;

export const TAX_TYPE_LABELS: Record<(typeof TAX_TYPES)[number], string> = {
  GST: "GST",
  HST: "HST",
  VAT: "VAT",
  SALES_TAX: "Sales Tax",
  OTHER: "Other",
};

// Mirrors the CalculationMethod enum. Purely descriptive metadata in this
// phase (see src/tax/tax-codes.ts) — no calculation is implemented here.
export const CALCULATION_METHODS = ["STANDARD_RATE", "ZERO_RATE", "EXEMPT", "OUT_OF_SCOPE"] as const;

export const CALCULATION_METHOD_LABELS: Record<(typeof CALCULATION_METHODS)[number], string> = {
  STANDARD_RATE: "Standard Rate",
  ZERO_RATE: "Zero-Rated",
  EXEMPT: "Exempt",
  OUT_OF_SCOPE: "Out of Scope",
};

// TaxCode.isActive is a plain boolean at the data layer, same pattern as
// Account.isActive — the UI presents it as a two-value status.
export const TAX_CODE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type TaxCodeStatus = (typeof TAX_CODE_STATUSES)[number];

export const TAX_CODE_STATUS_LABELS: Record<TaxCodeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// The four countries this phase supports (spec section "COUNTRIES"), same
// set as INITIAL_COUNTRIES — kept as its own named export so tax UI code
// reads intent rather than reaching into the company-settings constant.
export const TAX_COUNTRIES = INITIAL_COUNTRIES;

export const COMPANY_SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Newest first" },
  { value: "createdAt_asc", label: "Oldest first" },
  { value: "updatedAt_desc", label: "Recently updated" },
  { value: "legalName_asc", label: "Legal name (A–Z)" },
  { value: "legalName_desc", label: "Legal name (Z–A)" },
  { value: "displayName_asc", label: "Display name (A–Z)" },
  { value: "displayName_desc", label: "Display name (Z–A)" },
] as const;
