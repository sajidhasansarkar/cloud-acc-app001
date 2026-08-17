CREATE TABLE "document_processing_results" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "detectedFileType" "DocumentFileType" NOT NULL,
  "pageCount" INTEGER,
  "sheetCount" INTEGER,
  "rowCount" INTEGER,
  "columnCount" INTEGER,
  "requiresOcr" BOOLEAN NOT NULL DEFAULT false,
  "extractedContentReference" TEXT,
  "processingError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_processing_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_processing_results_documentId_key" ON "document_processing_results"("documentId");
CREATE INDEX "document_processing_results_detectedFileType_idx" ON "document_processing_results"("detectedFileType");
CREATE INDEX "document_processing_results_processedAt_idx" ON "document_processing_results"("processedAt");
ALTER TABLE "document_processing_results" ADD CONSTRAINT "document_processing_results_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
