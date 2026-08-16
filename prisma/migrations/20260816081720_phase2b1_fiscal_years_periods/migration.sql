-- Phase 2B-1: Fiscal Year & Accounting Period Foundation
--
-- NOTE: Same as the Phase 2A migration — this sandbox has no network access
-- to Neon or to Prisma's engine binaries, so `prisma migrate dev` could not
-- be run here to auto-generate/validate this file against a live database.
-- It is hand-written to match prisma/schema.prisma exactly. See "How to
-- apply" at the bottom before running it for real.

-- 1. Shared status enum for FiscalYear and AccountingPeriod.
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- 2. fiscal_years
CREATE TABLE "fiscal_years" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate"   TIMESTAMP(3) NOT NULL,
    "status"    "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_years_companyId_name_key" ON "fiscal_years"("companyId", "name");
CREATE INDEX "fiscal_years_companyId_idx" ON "fiscal_years"("companyId");
CREATE INDEX "fiscal_years_companyId_startDate_endDate_idx" ON "fiscal_years"("companyId", "startDate", "endDate");

ALTER TABLE "fiscal_years"
    ADD CONSTRAINT "fiscal_years_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Belt-and-braces DB-level check in addition to the application-level check
-- in src/accounting/fiscal-years.ts: a fiscal year's end must be after its
-- start. (True overlap-prevention between fiscal years of the same company
-- needs a range/exclusion constraint — see the note at the bottom — so that
-- part stays application-level for now.)
ALTER TABLE "fiscal_years"
    ADD CONSTRAINT "fiscal_years_end_after_start_check"
    CHECK ("endDate" > "startDate");

-- 3. accounting_periods
CREATE TABLE "accounting_periods" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "startDate"    TIMESTAMP(3) NOT NULL,
    "endDate"      TIMESTAMP(3) NOT NULL,
    "status"       "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_periods_fiscalYearId_periodNumber_key" ON "accounting_periods"("fiscalYearId", "periodNumber");
CREATE INDEX "accounting_periods_companyId_idx" ON "accounting_periods"("companyId");
CREATE INDEX "accounting_periods_fiscalYearId_idx" ON "accounting_periods"("fiscalYearId");
CREATE INDEX "accounting_periods_companyId_startDate_endDate_idx" ON "accounting_periods"("companyId", "startDate", "endDate");

ALTER TABLE "accounting_periods"
    ADD CONSTRAINT "accounting_periods_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_periods"
    ADD CONSTRAINT "accounting_periods_fiscalYearId_fkey"
    FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_periods"
    ADD CONSTRAINT "accounting_periods_end_after_start_check"
    CHECK ("endDate" > "startDate");

-- NOTE on overlap prevention (fiscal years of the same company must not
-- overlap; a period must stay inside its own fiscal year): Postgres can
-- enforce true range-overlap rules with an EXCLUDE USING gist constraint
-- (needs `CREATE EXTENSION IF NOT EXISTS btree_gist;`), but that changes
-- error handling (a Postgres exclusion-violation error instead of a normal
-- validation message) and wasn't run/tested against a live database here.
-- Rather than ship an untested constraint, Phase 2B-1 enforces both rules
-- in application code (src/accounting/fiscal-years.ts,
-- src/accounting/accounting-periods.ts) where they can return a clean
-- error message. Adding the gist exclusion constraint as defense-in-depth
-- is a reasonable follow-up once this has been tested against Neon.

-- How to apply:
--   npx prisma migrate resolve --applied 20260816081720_phase2b1_fiscal_years_periods
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
