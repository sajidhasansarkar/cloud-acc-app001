-- Phase 4B-7: Source vs AI vs Draft reconciliation and human review status.

CREATE TYPE "HumanReviewStatus" AS ENUM (
  'PENDING_REVIEW',
  'NEEDS_CORRECTION',
  'READY_FOR_POSTING',
  'REJECTED'
);

ALTER TABLE "ai_review_records"
ADD COLUMN "humanReviewStatus" "HumanReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

ALTER TABLE "ai_review_audits"
ADD COLUMN "previousHumanReviewStatus" "HumanReviewStatus",
ADD COLUMN "newHumanReviewStatus" "HumanReviewStatus",
ADD COLUMN "relevantCorrection" TEXT;

CREATE INDEX "ai_review_records_humanReviewStatus_updatedAt_idx"
ON "ai_review_records"("humanReviewStatus", "updatedAt");

UPDATE "ai_review_records"
SET "humanReviewStatus" = 'REJECTED'
WHERE "decision" = 'REJECTED';
