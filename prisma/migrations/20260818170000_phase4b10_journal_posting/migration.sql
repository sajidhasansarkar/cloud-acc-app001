-- Phase 4B-10: human-controlled Journal Entry posting.
ALTER TYPE "AIReviewAuditAction" ADD VALUE 'JOURNAL_POSTED';

ALTER TABLE "journal_entries"
  ADD COLUMN "postedAt" TIMESTAMP(3),
  ADD COLUMN "postedByUserId" TEXT;

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_postedByUserId_fkey"
  FOREIGN KEY ("postedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "journal_entries_postedByUserId_idx" ON "journal_entries"("postedByUserId");
