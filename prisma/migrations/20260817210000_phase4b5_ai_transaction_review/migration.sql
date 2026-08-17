-- Phase 4B-5: AI transaction review, structured suggestions and human audit trail
CREATE TYPE "AIReviewDecision" AS ENUM ('ACCEPTED', 'REJECTED', 'EDITED');
CREATE TYPE "AIReviewAuditAction" AS ENUM ('GENERATED', 'ACCEPTED', 'REJECTED', 'EDITED', 'FAILED');

ALTER TABLE "ai_review_records"
  ADD COLUMN "decision" "AIReviewDecision",
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "humanAccountId" TEXT,
  ADD COLUMN "humanDebit" DECIMAL(20,4),
  ADD COLUMN "humanCredit" DECIMAL(20,4),
  ADD COLUMN "humanAmount" DECIMAL(20,4),
  ADD COLUMN "humanNotes" TEXT;

CREATE TABLE "ai_review_suggestions" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "contextVersion" TEXT NOT NULL,
  "suggestedAccountId" TEXT,
  "suggestedDebit" DECIMAL(20,4),
  "suggestedCredit" DECIMAL(20,4),
  "suggestedAmount" DECIMAL(20,4),
  "explanation" TEXT NOT NULL,
  "confidence" "NormalizationConfidence" NOT NULL,
  "warnings" JSONB NOT NULL,
  "alternatives" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_review_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_review_suggestions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "normalized_transaction_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_review_suggestions_suggestedAccountId_fkey" FOREIGN KEY ("suggestedAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ai_review_audits" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "suggestionId" TEXT,
  "action" "AIReviewAuditAction" NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "contextVersion" TEXT,
  "confidence" "NormalizationConfidence",
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_review_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_review_audits_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "normalized_transaction_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_review_audits_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ai_review_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ai_review_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "ai_review_records"
  ADD CONSTRAINT "ai_review_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_review_records_humanAccountId_fkey" FOREIGN KEY ("humanAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_review_records_decision_reviewedAt_idx" ON "ai_review_records"("decision", "reviewedAt");
CREATE INDEX "ai_review_suggestions_candidateId_createdAt_idx" ON "ai_review_suggestions"("candidateId", "createdAt");
CREATE INDEX "ai_review_suggestions_suggestedAccountId_idx" ON "ai_review_suggestions"("suggestedAccountId");
CREATE INDEX "ai_review_audits_candidateId_createdAt_idx" ON "ai_review_audits"("candidateId", "createdAt");
CREATE INDEX "ai_review_audits_action_createdAt_idx" ON "ai_review_audits"("action", "createdAt");
