-- Add the schema-declared back-relations from AI review suggestions/audits
-- to their candidate's unique AIReviewRecord.
ALTER TABLE "ai_review_suggestions"
  ADD CONSTRAINT "ai_review_suggestions_reviewRecord_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ai_review_records"("candidateId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_review_audits"
  ADD CONSTRAINT "ai_review_audits_reviewRecord_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ai_review_records"("candidateId")
  ON DELETE CASCADE ON UPDATE CASCADE;
