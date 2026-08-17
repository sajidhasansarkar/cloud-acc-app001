import type { TaxType } from "@prisma/client";

/**
 * Suggested TaxType(s) per supported country (Phase 3B-1).
 *
 * This exists purely to power a future "add tax code" form's defaults/
 * filtering — it is guidance, not validation or business logic. Nothing in
 * this phase rejects a TaxCode whose taxType isn't in this list for its
 * countryCode (e.g. a company operating cross-border, or a future country
 * not listed here yet, can still use OTHER). No rates are implied or
 * hard-coded here (spec section 5) — only which broad tax categories are
 * foundational for each country's system:
 *
 *  - Canada: federal GST, plus HST in provinces that have harmonized it
 *    with their provincial sales tax.
 *  - United States: no federal VAT/GST — sales tax is state/local.
 *  - United Kingdom: VAT.
 *  - Australia: GST.
 *
 * Same four countries as INITIAL_COUNTRIES in src/lib/constants.ts. Keyed
 * by ISO 3166-1 alpha-2 to match TaxCode.countryCode / Company.country.
 */
export const SUGGESTED_TAX_TYPES_BY_COUNTRY: Record<string, TaxType[]> = {
  CA: ["GST", "HST"],
  US: ["SALES_TAX"],
  GB: ["VAT"],
  AU: ["GST"],
};

// Convenience for UI code that wants a flat list regardless of country.
// Falls back to just OTHER for a country not yet in the map above, rather
// than throwing — this phase never blocks a country the UI doesn't know
// about yet.
export function getSuggestedTaxTypes(countryCode: string): TaxType[] {
  return SUGGESTED_TAX_TYPES_BY_COUNTRY[countryCode.toUpperCase()] ?? ["OTHER"];
}
