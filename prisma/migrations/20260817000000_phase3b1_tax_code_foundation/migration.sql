-- Phase 3B-1: Tax Code Database Foundation
--
-- NOTE: Same as every prior migration in this project — this sandbox has
-- no network access to Neon or to Prisma's engine binaries, so
-- `prisma migrate dev` could not be run here to auto-generate/validate this
-- file against a live database. It is hand-written to match
-- prisma/schema.prisma exactly. See "How to apply" at the bottom before
-- running it for real.

-- 1. TaxType enum — the broad tax category a TaxCode represents.
CREATE TYPE "TaxType" AS ENUM ('GST', 'HST', 'VAT', 'SALES_TAX', 'OTHER');

-- 2. CalculationMethod enum — how a TaxCode's rate should be applied
-- (storage only in this phase, no calculation engine yet).
CREATE TYPE "CalculationMethod" AS ENUM ('STANDARD_RATE', 'ZERO_RATE', 'EXEMPT', 'OUT_OF_SCOPE');

-- 3. tax_codes
CREATE TABLE "tax_codes" (
    "id"                TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "countryCode"       TEXT NOT NULL,
    "code"              TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "taxType"           "TaxType" NOT NULL,
    "calculationMethod" "CalculationMethod" NOT NULL,
    "rate"              DECIMAL(7,4) NOT NULL,
    "isRecoverable"     BOOLEAN NOT NULL DEFAULT true,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

-- Tax code must be unique within a company, but the same code may repeat
-- across different companies — same pattern as accounts_companyId_code_key.
CREATE UNIQUE INDEX "tax_codes_companyId_code_key" ON "tax_codes"("companyId", "code");

CREATE INDEX "tax_codes_companyId_idx" ON "tax_codes"("companyId");
CREATE INDEX "tax_codes_companyId_countryCode_idx" ON "tax_codes"("companyId", "countryCode");
CREATE INDEX "tax_codes_companyId_taxType_idx" ON "tax_codes"("companyId", "taxType");

ALTER TABLE "tax_codes"
    ADD CONSTRAINT "tax_codes_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Belt-and-braces DB-level check in addition to the application-level
-- check in src/tax/tax-codes.ts (validateRateForMethod): a standard-rate
-- code must carry a positive rate, and a zero-rated/exempt/out-of-scope
-- code must carry exactly 0. Same defense-in-depth tradeoff already made
-- for the account-hierarchy check in the Phase 3A-1 migration.
ALTER TABLE "tax_codes"
    ADD CONSTRAINT "tax_codes_rate_matches_method_check"
    CHECK (
        ("calculationMethod" = 'STANDARD_RATE' AND "rate" > 0)
        OR ("calculationMethod" <> 'STANDARD_RATE' AND "rate" = 0)
    );

-- How to apply:
--   npx prisma migrate resolve --applied 20260817000000_phase3b1_tax_code_foundation
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
