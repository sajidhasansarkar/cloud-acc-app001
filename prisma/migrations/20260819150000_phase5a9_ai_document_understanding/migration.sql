-- Phase 5A-9: OpenAI document understanding
-- Adds storage for the OpenAI-based document-understanding pass (classification
-- confirmation + transaction/statement extraction) that runs after deterministic
-- extraction (Phase 5A-3). Additive/nullable only — does not touch any existing
-- column, so it cannot invalidate previously-processed documents.
ALTER TABLE "document_processing_results"
  ADD COLUMN "aiUnderstandingProvider" TEXT,
  ADD COLUMN "aiUnderstandingModel" TEXT,
  ADD COLUMN "aiUnderstandingReference" TEXT,
  ADD COLUMN "aiUnderstandingError" TEXT,
  ADD COLUMN "aiUnderstandingProcessedAt" TIMESTAMP(3);
