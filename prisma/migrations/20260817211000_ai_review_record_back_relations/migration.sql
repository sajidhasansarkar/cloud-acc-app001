-- Link AI review suggestions and audits to the unique AI review record by candidateId.
ALTER TABLE "ai_review_suggestions"
  ADD CONSTRAINT "ai_review_suggestions_review_record_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ai_review_records"("candidateId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_review_audits"
  ADD CONSTRAINT "ai_review_audits_review_record_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ai_review_records"("candidateId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
