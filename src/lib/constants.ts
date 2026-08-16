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

export const COMPANY_SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Newest first" },
  { value: "createdAt_asc", label: "Oldest first" },
  { value: "updatedAt_desc", label: "Recently updated" },
  { value: "legalName_asc", label: "Legal name (A–Z)" },
  { value: "legalName_desc", label: "Legal name (Z–A)" },
  { value: "displayName_asc", label: "Display name (A–Z)" },
  { value: "displayName_desc", label: "Display name (Z–A)" },
] as const;
