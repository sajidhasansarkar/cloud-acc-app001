-- Phase 5A-6: editable draft journal provenance, explicit line ordering,
-- and optimistic concurrency.
ALTER TABLE "journal_entries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "journal_entry_lines" RENAME COLUMN "lineNumber" TO "lineOrder";

CREATE TYPE "JournalFieldSource" AS ENUM ('AI', 'USER');
ALTER TABLE "journal_entry_lines"
  ADD COLUMN "accountSource" "JournalFieldSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "descriptionSource" "JournalFieldSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "debitSource" "JournalFieldSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "creditSource" "JournalFieldSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "taxCodeSource" "JournalFieldSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "referenceSource" "JournalFieldSource" NOT NULL DEFAULT 'USER';
