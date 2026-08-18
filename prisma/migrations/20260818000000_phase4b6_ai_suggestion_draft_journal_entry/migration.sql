-- Phase 4B-6: Accepted AI Suggestion -> Draft Journal Entry traceability

-- New audit action recorded when a Draft Journal Entry is created from an
-- accepted AI suggestion.
ALTER TYPE "AIReviewAuditAction" ADD VALUE 'DRAFT_CREATED';

-- Traceability from a Journal Entry back to its Source Document,
-- Normalized Transaction Candidate, and AI Suggestion (all nullable —
-- manually created entries leave these null).
ALTER TABLE "journal_entries"
  ADD COLUMN "sourceDocumentId" TEXT,
  ADD COLUMN "transactionCandidateId" TEXT,
  ADD COLUMN "aiSuggestionId" TEXT;

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "journal_entries_transactionCandidateId_fkey" FOREIGN KEY ("transactionCandidateId") REFERENCES "normalized_transaction_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "journal_entries_aiSuggestionId_fkey" FOREIGN KEY ("aiSuggestionId") REFERENCES "ai_review_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "journal_entries_transactionCandidateId_idx" ON "journal_entries"("transactionCandidateId");
CREATE INDEX "journal_entries_sourceDocumentId_idx" ON "journal_entries"("sourceDocumentId");
CREATE INDEX "journal_entries_aiSuggestionId_idx" ON "journal_entries"("aiSuggestionId");

-- Which Draft Journal Entry (if any) a DRAFT_CREATED audit row relates to.
ALTER TABLE "ai_review_audits"
  ADD COLUMN "journalEntryId" TEXT;

ALTER TABLE "ai_review_audits"
  ADD CONSTRAINT "ai_review_audits_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_review_audits_journalEntryId_idx" ON "ai_review_audits"("journalEntryId");
