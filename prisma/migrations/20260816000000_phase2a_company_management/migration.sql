-- Phase 2A: Company Management & Country Configuration
--
-- NOTE: This file is a hand-written REFERENCE migration. This sandbox has no
-- network access to Neon or to Prisma's engine binaries, so `prisma migrate
-- dev` could not be run here to auto-generate and validate it against your
-- database. Read the "How to apply" note at the bottom before running this.

-- 1. Rename "countries" -> "country_configurations" and its columns, adding
--    the new Phase 2A fields. Using ALTER TABLE ... RENAME preserves any
--    country rows you already seeded in Phase 1 instead of dropping them.
ALTER TABLE "countries" RENAME TO "country_configurations";
ALTER TABLE "country_configurations" RENAME COLUMN "code" TO "countryCode";
ALTER TABLE "country_configurations" RENAME COLUMN "name" TO "countryName";
ALTER TABLE "country_configurations" RENAME COLUMN "currency" TO "currencyCode";

-- The old table used countryCode ("code") as its primary key. Phase 2A gives
-- CountryConfiguration its own cuid `id` and makes countryCode a unique
-- column instead, so Company can reference it by a stable id.
ALTER TABLE "country_configurations" ADD COLUMN "id" TEXT;
UPDATE "country_configurations" SET "id" = 'ctry_' || "countryCode" WHERE "id" IS NULL;
ALTER TABLE "country_configurations" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "country_configurations" DROP CONSTRAINT "countries_pkey";
ALTER TABLE "country_configurations" ADD CONSTRAINT "country_configurations_pkey" PRIMARY KEY ("id");
ALTER TABLE "country_configurations" ADD CONSTRAINT "country_configurations_countryCode_key" UNIQUE ("countryCode");

-- New required field: currencySymbol. Backfilled for the four Phase 1
-- countries; NOT NULL is applied after backfilling.
ALTER TABLE "country_configurations" ADD COLUMN "currencySymbol" TEXT;
UPDATE "country_configurations" SET "currencySymbol" = '£' WHERE "countryCode" = 'GB';
UPDATE "country_configurations" SET "currencySymbol" = '$' WHERE "countryCode" IN ('CA', 'US', 'AU');
UPDATE "country_configurations" SET "currencySymbol" = '$' WHERE "currencySymbol" IS NULL; -- fallback for any custom rows
ALTER TABLE "country_configurations" ALTER COLUMN "currencySymbol" SET NOT NULL;

-- Future-use nullable fields — not implemented in Phase 2A.
ALTER TABLE "country_configurations" ADD COLUMN "dateFormat" TEXT;
ALTER TABLE "country_configurations" ADD COLUMN "taxSystem" TEXT;
ALTER TABLE "country_configurations" ADD COLUMN "taxAuthority" TEXT;
ALTER TABLE "country_configurations" ADD COLUMN "accountingStandard" TEXT;

-- 2. Extend "companies" with the new Business Information fields.
ALTER TABLE "companies" ADD COLUMN "businessNumber" TEXT;
ALTER TABLE "companies" ADD COLUMN "address" TEXT;
ALTER TABLE "companies" ADD COLUMN "city" TEXT;
ALTER TABLE "companies" ADD COLUMN "stateProvince" TEXT;
ALTER TABLE "companies" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "companies" ADD COLUMN "countryConfigurationId" TEXT;

-- Backfill countryConfigurationId for existing companies from their
-- existing ISO country code, then wire up the FK + index.
UPDATE "companies" c
SET "countryConfigurationId" = cc."id"
FROM "country_configurations" cc
WHERE cc."countryCode" = c."country";

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_countryConfigurationId_fkey"
  FOREIGN KEY ("countryConfigurationId") REFERENCES "country_configurations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "companies_countryConfigurationId_idx" ON "companies"("countryConfigurationId");

-- 3. CompanyStatus default changes from ONBOARDING to ACTIVE for new rows.
--    ONBOARDING remains a valid enum value for backward compatibility with
--    any Phase 1 rows already in that status — nothing to migrate here.
ALTER TABLE "companies" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- ---------------------------------------------------------------------------
-- How to apply this migration
-- ---------------------------------------------------------------------------
-- Preferred: let Prisma generate and validate its own migration against your
-- real database instead of trusting this hand-written file blindly:
--
--   1. Delete this migration.sql (keep the folder name or remove the folder).
--   2. Run:  npx prisma migrate dev --name phase2a_company_management
--   3. Prisma will diff prisma/schema.prisma against your database. Because
--      Country -> CountryConfiguration looks like "drop one model, add
--      another" from a pure schema diff, the interactive CLI will likely
--      ask: "Have you renamed model `Country` to `CountryConfiguration`?"
--      and similar prompts for the renamed columns (code -> countryCode,
--      name -> countryName, currency -> currencyCode). Answer YES to each
--      rename prompt to preserve your seeded country data. If it does not
--      ask and instead proposes DROP TABLE "countries", stop and apply the
--      SQL above manually instead (see option below).
--
-- Manual alternative (if you'd rather review/run the SQL yourself, e.g. via
-- `psql` or Neon's SQL editor):
--   1. Run the SQL above against your database.
--   2. Mark it as applied without Prisma re-running it:
--        npx prisma migrate resolve --applied 20260816000000_phase2a_company_management
--   3. Run `npx prisma generate` to regenerate the Prisma Client types.
