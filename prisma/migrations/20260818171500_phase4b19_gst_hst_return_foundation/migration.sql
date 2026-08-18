-- Phase 4B-19: GST/HST Return calculation foundation.
-- Tax metadata is attached to existing Journal Entry Lines; no second
-- transaction system or duplicate accounting records are introduced.

ALTER TABLE "journal_entry_lines"
  ADD COLUMN "taxCodeId" TEXT;

CREATE INDEX "journal_entry_lines_taxCodeId_idx"
  ON "journal_entry_lines"("taxCodeId");

ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "journal_entry_lines_taxCodeId_fkey"
  FOREIGN KEY ("taxCodeId") REFERENCES "tax_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
