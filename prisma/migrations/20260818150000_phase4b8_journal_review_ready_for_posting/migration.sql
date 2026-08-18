-- Phase 4B-8: Journal Entry human review workflow.

-- Reuse the existing JournalEntryStatus lifecycle rather than creating a
-- second review-status field.
ALTER TYPE "JournalEntryStatus" ADD VALUE 'IN_REVIEW' AFTER 'DRAFT';
ALTER TYPE "JournalEntryStatus" ADD VALUE 'READY_FOR_POSTING' AFTER 'IN_REVIEW';

-- Reuse the existing AIReviewAudit trail for Journal Entry review/status
-- changes. Manual Journal Entries do not have a transaction candidate, so
-- candidateId becomes nullable while retaining the existing foreign key.
ALTER TYPE "AIReviewAuditAction" ADD VALUE 'JOURNAL_SENT_FOR_REVIEW';
ALTER TYPE "AIReviewAuditAction" ADD VALUE 'JOURNAL_MARKED_READY';
ALTER TYPE "AIReviewAuditAction" ADD VALUE 'JOURNAL_RETURNED_TO_DRAFT';

ALTER TABLE "ai_review_audits"
  ALTER COLUMN "candidateId" DROP NOT NULL;
