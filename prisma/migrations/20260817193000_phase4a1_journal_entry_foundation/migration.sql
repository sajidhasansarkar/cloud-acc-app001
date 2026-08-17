-- Phase 4A-1: Journal Entry Database Foundation
--
-- NOTE: Same as every prior migration in this project -- this sandbox has
-- no network access to Neon or to Prisma's engine binaries, so
-- `prisma migrate dev` could not be run here to auto-generate/validate this
-- file against a live database. It is hand-written to match
-- prisma/schema.prisma exactly. See "How to apply" at the bottom before
-- running it for real.

-- 1. JournalEntryStatus enum -- lifecycle state of a journal entry.
CREATE TYPE "JournalEntryStatus" AS ENUM (
    'DRAFT',
    'POSTED',
    'VOID'
);

-- 2. JournalEntrySourceType enum -- where a journal entry originated.
CREATE TYPE "JournalEntrySourceType" AS ENUM (
    'MANUAL',
    'IMPORT',
    'AI',
    'BANK',
    'OTHER'
);

-- 3. journal_entries
CREATE TABLE "journal_entries" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "fiscalYearId"       TEXT NOT NULL,
    "accountingPeriodId" TEXT NOT NULL,
    "entryNumber"        TEXT NOT NULL,
    "entryDate"          TIMESTAMP(3) NOT NULL,
    "reference"          TEXT,
    "description"        TEXT,
    "label"              TEXT,
    "status"             "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType"         "JournalEntrySourceType" NOT NULL DEFAULT 'MANUAL',
    "createdById"        TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- 4. journal_entry_lines
CREATE TABLE "journal_entry_lines" (
    "id"             TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId"      TEXT NOT NULL,
    "description"    TEXT,
    "reference"      TEXT,
    "debit"          DECIMAL(19,4) NOT NULL,
    "credit"         DECIMAL(19,4) NOT NULL,
    "lineNumber"     INTEGER NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- Unique: entry number unique within a company (spec section 10). This
-- also creates the covering index that satisfies the "entryNumber" index
-- requirement in spec section 15.
CREATE UNIQUE INDEX "journal_entries_companyId_entryNumber_key" ON "journal_entries"("companyId", "entryNumber");

-- Indexes (spec section 15).
CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");
CREATE INDEX "journal_entries_companyId_entryDate_idx" ON "journal_entries"("companyId", "entryDate");
CREATE INDEX "journal_entries_companyId_status_idx" ON "journal_entries"("companyId", "status");
CREATE INDEX "journal_entries_accountingPeriodId_idx" ON "journal_entries"("accountingPeriodId");
CREATE INDEX "journal_entries_fiscalYearId_idx" ON "journal_entries"("fiscalYearId");
CREATE INDEX "journal_entries_createdAt_idx" ON "journal_entries"("createdAt");

CREATE INDEX "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");
CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

-- companyId: entry belongs to Company. Company is the tenant boundary, so
-- this cascades on delete like every other per-company table (accounts,
-- tax_codes, account_mappings).
ALTER TABLE "journal_entries"
    ADD CONSTRAINT "journal_entries_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- fiscalYearId / accountingPeriodId: no ON DELETE action specified
-- (defaults to NO ACTION/RESTRICT) -- a fiscal year or period that already
-- has journal entries posted against it should not be deletable out from
-- under them. Application code re-derives ownership through Company
-- anyway (see src/accounting/access.ts), so this is a belt-and-braces
-- guard, not the primary security boundary.
ALTER TABLE "journal_entries"
    ADD CONSTRAINT "journal_entries_fiscalYearId_fkey"
    FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entries"
    ADD CONSTRAINT "journal_entries_accountingPeriodId_fkey"
    FOREIGN KEY ("accountingPeriodId") REFERENCES "accounting_periods"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- createdById: no ON DELETE action specified (defaults to RESTRICT) --
-- users are suspended (UserStatus), not hard-deleted, in this system, so
-- this should never actually block anything in practice; it exists so a
-- journal entry's audit trail can never silently lose its author.
ALTER TABLE "journal_entries"
    ADD CONSTRAINT "journal_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- journalEntryId: line belongs to JournalEntry. Cascades so deleting a
-- (DRAFT-only, per application code) journal entry removes its lines too.
ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- accountId: no ON DELETE action specified (defaults to RESTRICT) --
-- accounts are never hard-deleted either (see Account.isActive), same
-- rationale as account_mappings.accountId in the Phase 3C-1 migration.
ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Belt-and-braces DB-level checks in addition to the application-level
-- checks in src/accounting/journal-entries.ts (validateLineAmounts): a
-- debit or credit can never be negative (spec section 8). Same
-- defense-in-depth tradeoff already made for
-- tax_codes_rate_matches_method_check in the Phase 3B-1 migration.
ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_debit_nonnegative_check"
    CHECK ("debit" >= 0);

ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_credit_nonnegative_check"
    CHECK ("credit" >= 0);

-- IMPORTANT: this migration does not enforce "accountId must belong to the
-- same companyId as the parent journal entry" at the database level --
-- Postgres foreign keys can't express a conditional cross-table match like
-- that. That invariant (spec section 5: prevent cross-company account
-- references) is enforced at the application level instead, in
-- src/accounting/journal-entries.ts (createJournalEntry), the same way
-- account_mappings' "same company" rule is enforced in
-- src/mapping/account-mappings.ts (resolveTargets) rather than in SQL.
--
-- IMPORTANT: this migration also does not enforce "Total Debit = Total
-- Credit" or "entryDate falls within the selected accounting period" at
-- the database level -- both are per-entry, multi-row/cross-table
-- invariants that a CHECK constraint can't express. Both are enforced at
-- the application level in src/accounting/journal-entries.ts
-- (isEntryBalanced / validateEntryDateInPeriod), per spec sections 7 and 9
-- ("prepare reusable server-side validation" -- these are explicitly
-- app-layer, not DB-layer, requirements).

-- How to apply:
--   npx prisma migrate resolve --applied 20260817193000_phase4a1_journal_entry_foundation
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
