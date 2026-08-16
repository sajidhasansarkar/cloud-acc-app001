-- Phase 3A-1: Chart of Accounts Database Foundation
--
-- NOTE: Same as every prior migration in this project — this sandbox has
-- no network access to Neon or to Prisma's engine binaries, so
-- `prisma migrate dev` could not be run here to auto-generate/validate this
-- file against a live database. It is hand-written to match
-- prisma/schema.prisma exactly. See "How to apply" at the bottom before
-- running it for real.

-- 1. AccountType enum — the five accounting classes.
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- 2. accounts
CREATE TABLE "accounts" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "code"            TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "type"            "AccountType" NOT NULL,
    "subtype"         TEXT,
    "parentAccountId" TEXT,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- Account code must be unique within a company, but the same code may
-- repeat across different companies (spec section 5).
CREATE UNIQUE INDEX "accounts_companyId_code_key" ON "accounts"("companyId", "code");

CREATE INDEX "accounts_companyId_idx" ON "accounts"("companyId");
CREATE INDEX "accounts_companyId_type_idx" ON "accounts"("companyId", "type");
CREATE INDEX "accounts_parentAccountId_idx" ON "accounts"("parentAccountId");

ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Self-referencing parent/child relationship. ON DELETE SET NULL rather
-- than CASCADE: deleting a parent account must not cascade-delete its
-- children (accounts are meant to be deactivated, never deleted — spec
-- section 6) — it should simply orphan them to no parent. In practice
-- accounts are not deleted by any code path in this phase, but the FK is
-- defined defensively in case a later phase adds deletion for accounts
-- that were never used.
ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_parentAccountId_fkey"
    FOREIGN KEY ("parentAccountId") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Belt-and-braces DB-level check in addition to the application-level check
-- in src/accounting/accounts.ts (wouldCreateCycle): an account can never be
-- its own direct parent. This only catches the single-hop case — deeper
-- cycles (A -> B -> A) can't be expressed as a plain CHECK constraint and
-- stay an application-level responsibility, same tradeoff already made for
-- fiscal year overlap in the Phase 2B-1 migration.
ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_not_own_parent_check"
    CHECK ("parentAccountId" IS NULL OR "parentAccountId" <> "id");

-- How to apply:
--   npx prisma migrate resolve --applied 20260816134624_phase3a1_chart_of_accounts_foundation
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
