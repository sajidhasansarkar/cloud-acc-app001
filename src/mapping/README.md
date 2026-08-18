# mapping module

Backend-only account-mapping logic, added in Phase 3C-1. No UI here yet —
a future phase builds the screens that call these functions (same pattern
as `src/accounting` and `src/tax`: backend foundation first, UI later).

- `access.ts` — ownership-chain lookups (Organization → Company →
  AccountMapping). Re-exports `getOwnedCompany` / `getOwnedAccount` from
  `src/accounting/access.ts` and `getOwnedTaxCode` from `src/tax/access.ts`
  rather than duplicating them, and adds `getOwnedAccountMapping`. Every
  function below goes through these instead of trusting a bare id from the
  caller.
- `account-mappings.ts` — `createAccountMapping`, `listAccountMappings`,
  `getAccountMapping`, `updateAccountMapping`, and `activateAccountMapping`
  / `deactivateAccountMapping`. Enforces company isolation for the mapping
  itself and for whichever Account / TaxCode it references (a mapping can
  never point at another company's account or tax code), and requires at
  least one of accountId / taxCodeId to be set.

This phase only stores the mapping rule shape
(`sourceType` + `sourceValue` → `accountId` / `taxCodeId`, with a
`priority` for later tie-breaking). Nothing here evaluates a `sourceValue`
against a real transaction, applies a mapping automatically, or involves
AI — automatic transaction categorization, journal entries, bank import,
and reconciliation still don't exist. Do not add them here.

## Phase 5A-5 — transaction account mapping

`transaction-account-mapping.ts` maps normalized transaction candidates to
existing company Chart of Accounts accounts using the Phase 5A-4 AI
understanding suggestion as the AI input. It stores AI suggestions,
company-scoped debit/credit selections, confidence, alternatives, warnings,
reasoning, duplicate warnings, and user corrections without creating Journal
Entries or Journal Lines. Reprocessing updates the same mapping row and
preserves user-selected accounts.
