-- Phase 4B-4: AI review preparation/context audit foundation
CREATE TYPE "AIReviewStatus" AS ENUM ('NOT_REVIEWED', 'READY', 'REVIEWING', 'REVIEWED', 'NEEDS_HUMAN_REVIEW', 'FAILED');

CREATE TABLE "ai_review_records" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "status" "AIReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
  "provider" TEXT,
  "model" TEXT,
  "contextVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_review_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_review_records_candidateId_key" UNIQUE ("candidateId"),
  CONSTRAINT "ai_review_records_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "normalized_transaction_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_review_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ai_review_records_status_createdAt_idx" ON "ai_review_records"("status", "createdAt");
