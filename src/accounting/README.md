# accounting module

Backend-only fiscal year / accounting period logic, added in Phase 2B-1.
No UI here — Phase 2B-2 builds the screens that call these functions.

- `access.ts` — ownership-chain lookups (Organization → Company →
  FiscalYear → AccountingPeriod). Every function below goes through these
  instead of trusting a bare id from the caller.
- `fiscal-years.ts` — `createFiscalYear`, `getCurrentFiscalYear`, and
  status transitions (`openFiscalYear` / `closeFiscalYear` /
  `lockFiscalYear`).
- `accounting-periods.ts` — the pure `generateAccountingPeriods` splitter
  (MONTHLY/QUARTERLY), `generateAndCreateAccountingPeriods` (persists it),
  `getCurrentAccountingPeriod`, and status transitions.

Journal entries, transactions, ledger, tax, AI, banking, and reports still
don't exist — do not add them here.
