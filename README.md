# Internal Accounting Platform — Phase 1

Foundation for an internal bookkeeping/accounting platform. This project is
completely separate from any other project — do not connect it to an
existing corporate website.

Stack: Next.js 14 (App Router) + TypeScript, Prisma + PostgreSQL (Neon),
Tailwind CSS, NextAuth (credentials).

## Phase 1 scope

Implemented: authentication, roles (ADMIN / ACCOUNTANT / REVIEWER / MANAGER),
organization + company data model with tenant isolation, company management
(list/create/detail), dashboard with real DB-backed stats, and the full
sidebar navigation shell (2 modules functional, 19 placeholders for future
phases).

Not implemented yet (by design — see the original brief): AI, statement
parsing/OCR, transaction categorization, the journal engine, bank
reconciliation, tax calculations, general ledger, trial balance, financial
statements, payroll, invoicing, sales/purchases.

## First-time setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create your database** — sign up at [neon.tech](https://neon.tech),
   create a project, and copy both the pooled and direct (unpooled)
   connection strings.

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET` (generate with
   `openssl rand -base64 32`), and `NEXTAUTH_URL` (`http://localhost:3000`
   for local dev). Optionally adjust `SEED_*` values — these control the
   first admin account created by the seed script.

4. **Run the database migration**

   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed the first admin user + reference countries**

   ```bash
   npm run db:seed
   ```

   This prints the admin email/password to sign in with. Change the
   password after your first login (password change isn't built yet in
   Phase 1 — do this directly via `npx prisma studio` for now, or wait for
   the Members/Settings module in a later phase).

6. **Run the app**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000` and sign in.

## Quality checks

Run these locally before deploying — they could not be run inside the
environment this project was generated in (no network/database access
there):

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npx prisma validate # checks schema.prisma
npm run build        # production build
```

## Deploying

This project is meant to be deployed to Vercel, separately from any other
project:

1. Push this repository to its own Git repo.
2. Import it into a **new** Vercel project.
3. Add these environment variables in the Vercel project settings:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (your production URL)
   - `DOCUMENT_STORAGE_PROVIDER=vercel-blob`
   - `BLOB_READ_WRITE_TOKEN` (from a **private** Vercel Blob store)
4. The production build runs `prisma migrate deploy && next build`, so pending
   Prisma migrations are applied automatically during deployment.
5. Run `npm run db:seed` once against the production database to create the
   first admin account (or create one manually via Prisma Studio).

### Vercel document storage

Production document uploads use Vercel Blob rather than the serverless local
filesystem. `DOCUMENT_STORAGE_PROVIDER` is explicitly set to `vercel-blob`
above; the application also defaults to `vercel-blob` when the `VERCEL`
environment variable is present. Local development defaults to `local`.

The Blob store should be **private** because uploaded accounting documents
may contain sensitive financial information. Do not commit `BLOB_READ_WRITE_TOKEN`
or any other secrets.

If the previously exposed Neon database credential was ever active, rotate/revoke
it in Neon and replace both production/local credentials.

## Project structure

```
src/
  app/                 Routes (App Router)
    login/             Sign-in page
    dashboard/         Protected app shell + all modules
    api/auth/          NextAuth route handler
  actions/             Server actions (e.g. company creation, fiscal years,
                       accounting periods, chart of accounts, tax codes)
  components/
    ui/                Small shadcn-style primitives (Button, Card, Table…)
    dashboard/          Sidebar, topbar, stat cards, placeholder page
    companies/          Company selector + create-company form
    auth/               Login form
  lib/                 auth.ts, session.ts (org scoping), prisma.ts, rbac.ts,
                       validations.ts, nav.ts, utils.ts
  accounting/          Fiscal year / accounting period / chart of accounts
                       business logic (backend only — see
                       accounting/README.md)
  tax/                 Tax code business logic (backend only, Phase 3B-1 —
                       see tax/README.md)
  mapping/             Account mapping business logic (backend only, Phase
                       3C-1 — see mapping/README.md)
  ai/ banking/ reports/ integrations/
                       Empty placeholders for future-phase modules
prisma/
  schema.prisma        User, Organization, Membership, Company, Country,
                       FiscalYear, AccountingPeriod, Account, TaxCode,
                       AccountMapping
  seed.ts              Seeds countries + first admin user/org
```

## Phase 2B-1 scope

Added: `FiscalYear` and `AccountingPeriod` models, fiscal year creation with
overlap validation, a MONTHLY/QUARTERLY accounting period generator,
current-fiscal-year/current-period detection, and OPEN/CLOSED/LOCKED status
transitions for both. Backend only — no UI (that's Phase 2B-2).

## Phase 3A-1 scope

Added the `Account` model (chart of accounts) and backend logic in
`src/accounting/accounts.ts`: create/update/list/get, hierarchical
parent-account support (same-company only, cycle-safe), unique code per
company, and activate/deactivate (accounts are never deleted). Backend
only — no UI (that's Phase 3A-2).

## Phase 3A-2 scope

Added the basic Chart of Accounts UI at
`/companies/[companyId]/chart-of-accounts`: an account table (Code, Name,
Type, Subtype, Parent Account, Status, Actions), an Add Account dialog, an
Edit Account dialog (account code locked after creation), a View dialog,
and an Activate/Deactivate action — all built on the existing design
system (Table, Dialog, Select, Badge, Toast, EmptyState) and the Phase
3A-1 backend/actions layer. No tax, account mapping, journal entries,
transactions, general ledger, reports, or AI — still out of scope.

## Phase 3B-1 scope

Added the `TaxCode` model (flexible, country-aware tax code database
foundation covering Canada, United States, United Kingdom, and Australia)
and backend logic in `src/tax/tax-codes.ts`: create/update/list/get,
company isolation (User → Organization → Company → TaxCode, same pattern
as `src/accounting/access.ts`), unique code per company, and
activate/deactivate (tax codes are never deleted). `TaxType`
(GST/HST/VAT/SALES_TAX/OTHER) and `CalculationMethod`
(STANDARD_RATE/ZERO_RATE/EXEMPT/OUT_OF_SCOPE) are enums; the only
calculation-adjacent logic is a data-integrity check that a code's rate is
0 for ZERO_RATE/EXEMPT/OUT_OF_SCOPE and greater than 0 for STANDARD_RATE —
no actual tax calculation, filing, returns, AI tax decisions, account
mapping, or journal entries. No rates are seeded or hard-coded anywhere.
Backend only — no UI yet.

## Phase 3C-1 scope

Added the `AccountMapping` model (a reusable rule structure for eventually
routing a transaction — bank line, sales transaction, etc. — to a chart-of-
accounts `Account` and/or a `TaxCode`) and backend logic in
`src/mapping/account-mappings.ts`: create/update/list/get, company
isolation for both the mapping and whichever `Account` / `TaxCode` it
references (User → Organization → Company → AccountMapping, same pattern
as `src/accounting/access.ts` / `src/tax/access.ts`; cross-company
references are rejected), and activate/deactivate (mappings are never
deleted). `MappingSourceType`
(BANK_DESCRIPTION/VENDOR/CUSTOMER/CATEGORY/TRANSACTION_TYPE) is prepared as
an enum. No automatic matching engine, transaction categorization, AI,
journal entries, bank import, or reconciliation — those still don't exist.
Backend only — no UI yet.

## Phase 5A-2 — Document Classification & Processing Router

Implemented the metadata-only classification foundation. Uploaded documents are classified from filename, extension, and MIME metadata; no document contents are parsed and no AI/OCR provider is invoked.

- Classification model/state is stored in `document_classifications`.
- Supported accounting document types: bank statement, invoice, bill, receipt, balance sheet, income statement, trial balance, general ledger, tax document, payroll document, expense report, other, unknown.
- Confidence is an evidence level, not a probability. The configurable acceptance threshold is `DOCUMENT_CLASSIFICATION_CONFIDENCE_THRESHOLD` (`MEDIUM` by default).
- Low-confidence, unknown, failed, or ambiguous metadata matches route to `MANUAL_REVIEW`.
- `classifyAccountingDocument(documentId)` provides the authenticated, company-scoped service entry point.
- `routeDocument(documentId)` exposes the future processor boundary without invoking a processor.
- Manual correction is restricted to classifications that require review and is audited.
- Classification is idempotent; explicit reclassification is supported.
- Audit actions: `DOCUMENT_CLASSIFICATION_STARTED`, `DOCUMENT_CLASSIFIED`, `DOCUMENT_CLASSIFICATION_FAILED`, `DOCUMENT_CLASSIFICATION_CORRECTED`.
