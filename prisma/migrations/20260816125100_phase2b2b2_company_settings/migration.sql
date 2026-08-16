-- Phase 2B-2B-2: Company Settings (Accounting tab)
--
-- NOTE: Same as the Phase 2A and Phase 2B-1 migrations — this sandbox has
-- no network access to Neon or to Prisma's engine binaries, so
-- `prisma migrate dev` could not be run here to auto-generate/validate this
-- file against a live database. It is hand-written to match
-- prisma/schema.prisma exactly. See "How to apply" at the bottom before
-- running it for real.

-- 1. New enum backing Company.defaultPeriodFrequency. Same two values as
--    the existing periodFrequencySchema (src/lib/validations.ts) already
--    used by the period-generation workflow — this does not introduce a
--    new set of valid frequencies, just persists a company-level default
--    for the one that already exists.
CREATE TYPE "PeriodFrequency" AS ENUM ('MONTHLY', 'QUARTERLY');

-- 2. companies.defaultPeriodFrequency
--    NOT NULL with a DEFAULT so this backfills cleanly for every existing
--    row (Phase 1 / 2A / 2B-1 companies already in the database) without a
--    separate data migration step.
ALTER TABLE "companies"
    ADD COLUMN "defaultPeriodFrequency" "PeriodFrequency" NOT NULL DEFAULT 'MONTHLY';

-- How to apply:
--   npx prisma migrate resolve --applied 20260816125100_phase2b2b2_company_settings
--   (if this is the first migration you're applying in a fresh DB, use
--   `npx prisma migrate deploy` instead, which will run this file directly)
-- Then regenerate the client:
--   npx prisma generate
