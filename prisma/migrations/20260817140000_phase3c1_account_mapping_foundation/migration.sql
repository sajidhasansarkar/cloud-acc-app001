-- Phase 3C-1: Account Mapping Database Foundation
--
-- NOTE: Same as every prior migration in this project -- this sandbox has
-- no network access to Neon or to Prisma's engine binaries, so
-- `prisma migrate dev` could not be run here to auto-generate/validate this
-- file against a live database. It is hand-written to match
-- prisma/schema.prisma exactly. See "How to apply" at the bottom before
-- running it for real.

-- 1. MappingSourceType enum -- what kind of value an AccountMapping rule
-- matches against. No automatic matching engine reads this yet.
CREATE TYPE "MappingSourceType" AS ENUM (
    'BANK_DESCRIPTION',
    'VENDOR',
    'CUSTOMER',
    'CATEGORY',
    'TRANSACTION_TYPE'
);

-- 2. account_mappings
CREATE TABLE "account_mappings" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "sourceType"  "MappingSourceType" NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "accountId"   TEXT,
    "taxCodeId"   TEXT,
    "priority"    INTEGER NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_mappings_companyId_idx" ON "account_mappings"("companyId");
CREATE INDEX "account_mappings_companyId_sourceType_idx" ON "account_mappings"("companyId", "sourceType");
CREATE INDEX "account_mappings_companyId_sourceType_sourceValue_idx" ON "account_mappings"("companyId", "sourceType", "sourceValue");
CREATE INDEX "account_mappings_companyId_isActive_idx" ON "account_mappings"("companyId", "isActive");
CREATE INDEX "account_mappings_accountId_idx" ON "account_mappings"("accountId");
CREATE INDEX "account_mappings_taxCodeId_idx" ON "account_mappings"("taxCodeId");

-- companyId: mapping belongs to Company. Company is the tenant boundary,
-- so this cascades on delete like every other per-company table
-- (accounts, tax_codes).
ALTER TABLE "account_mappings"
    ADD CONSTRAINT "account_mappings_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- accountId: optional reference to Account. No ON DELETE action specified
-- (defaults to NO ACTION/RESTRICT) -- same as every other optional FK in
-- this schema (e.g. accounts.parentAccountId) -- because accounts are
-- never hard-deleted (see Account.isActive), only deactivated.
ALTER TABLE "account_mappings"
    ADD CONSTRAINT "account_mappings_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- taxCodeId: optional reference to TaxCode. Same rationale as accountId
-- above -- tax codes are never hard-deleted either (see TaxCode.isActive).
ALTER TABLE "account_mappings"
    ADD CONSTRAINT "account_mappings_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "tax_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Belt-and-braces DB-level check in addition to the application-level
-- check in src/mapping/account-mappings.ts (resolveTargets): a mapping
-- that references neither an account nor a tax code does nothing and is
-- rejected. Same defense-in-depth tradeoff already made for
-- tax_codes_rate_matches_method_check in the Phase 3B-1 migration.
ALTER TABLE "account_mappings"
    ADD CONSTRAINT "account_mappings_has_target_check"
    CHECK ("accountId" IS NOT NULL OR "taxCodeId" IS NOT NULL);

-- IMPORTANT: this migration does not enforce "accountId / taxCodeId must
-- belong to the same companyId as the mapping" at the database level --
-- Postgres foreign keys can't express a conditional cross-table match
-- like that. That invariant (spec section 2 / section 4: prevent
-- cross-company mappings) is enforced at the application level instead,
-- in src/mapping/account-mappings.ts (resolveTargets), the same way
-- Account.parentAccountId's "same company" rule is enforced in
-- src/accounting/accounts.ts (resolveParent) rather than in SQL.

-- How to apply:
--   npx prisma migrate resolve --applied 20260817140000_phase3c1_account_mapping_foundation
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
