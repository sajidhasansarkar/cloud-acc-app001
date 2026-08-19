-- Phase 5A-8: final human journal review, approval and pre-posting control.
-- Keep legacy IN_REVIEW / READY_FOR_POSTING values for backward compatibility,
-- while the Phase 5A-8 workflow uses the explicit approval states below.
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'NOT_BALANCED';
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'BALANCED';
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'READY_TO_POST';
ALTER TYPE "JournalEntryStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "journalApprovalRequireDifferentUser" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "rejectedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

CREATE INDEX IF NOT EXISTS "journal_entries_reviewedByUserId_idx" ON "journal_entries"("reviewedByUserId");
CREATE INDEX IF NOT EXISTS "journal_entries_approvedByUserId_idx" ON "journal_entries"("approvedByUserId");
CREATE INDEX IF NOT EXISTS "journal_entries_rejectedByUserId_idx" ON "journal_entries"("rejectedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reviewedByUserId_fkey') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reviewedByUserId_fkey"
      FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_approvedByUserId_fkey') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approvedByUserId_fkey"
      FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_rejectedByUserId_fkey') THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_rejectedByUserId_fkey"
      FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
