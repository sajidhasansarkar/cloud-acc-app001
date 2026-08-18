-- Phase 5A-3: Document Content Extraction Engine
CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

ALTER TABLE "document_processing_results"
  ADD COLUMN "extractionStatus" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "tableCount" INTEGER,
  ADD COLUMN "textBlockCount" INTEGER,
  ADD COLUMN "warnings" JSONB;

CREATE INDEX "document_processing_results_extractionStatus_idx"
  ON "document_processing_results"("extractionStatus");

-- The prior processing implementation used document status as its extraction
-- lifecycle. Keep existing successful processing records valid.
UPDATE "document_processing_results"
SET "extractionStatus" = 'COMPLETED'
WHERE "processedAt" IS NOT NULL AND "extractedContentReference" IS NOT NULL;

UPDATE "documents" SET "documentStatus" = 'COMPLETED' WHERE "documentStatus" = 'PROCESSING'
  AND EXISTS (SELECT 1 FROM "document_processing_results" r WHERE r."documentId" = "documents"."id" AND r."processedAt" IS NOT NULL);
