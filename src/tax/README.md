# tax module

Backend-only tax code logic, added in Phase 3B-1. No UI here yet — a
future phase builds the screens that call these functions (same pattern as
`src/accounting`: 3A-1 was backend-only, 3A-2 added the UI).

- `access.ts` — ownership-chain lookups (Organization → Company →
  TaxCode). Re-exports `getOwnedCompany` from `src/accounting/access.ts`
  rather than duplicating it, and adds `getOwnedTaxCode`. Every function
  below goes through these instead of trusting a bare id from the caller.
- `tax-codes.ts` — `createTaxCode`, `listTaxCodes`, `getTaxCode`,
  `updateTaxCode`, and `activateTaxCode` / `deactivateTaxCode`. Enforces
  company isolation and one data-integrity invariant (a tax code's rate
  must be 0 for ZERO_RATE/EXEMPT/OUT_OF_SCOPE and greater than 0 for
  STANDARD_RATE) — it does not calculate or apply tax to anything.
- `country-tax-guidance.ts` — non-binding, per-country suggested `TaxType`
  list (Canada → GST/HST, US → SALES_TAX, UK → VAT, Australia → GST) for a
  future "add tax code" form to default/filter by. No rates are implied or
  hard-coded anywhere in this module.

Phase 4B-19 adds `gst-hst-return.ts`, the server-side GST/HST calculation
foundation. It reads only POSTED Journal Entries / Journal Lines, uses the
existing TaxCode configuration and Prisma.Decimal arithmetic, and never files
or submits a return. A Journal Entry Line may reference an existing TaxCode;
the report uses that relationship for traceability and calculation. No tax
filing, authority integration, AI, file processing, or automatic journal
creation is implemented.
