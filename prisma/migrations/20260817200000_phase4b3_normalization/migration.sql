CREATE TYPE "NormalizationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "normalized_transaction_candidates" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sourceRowReference" TEXT NOT NULL,
  "sourceSheetName" TEXT,
  "sourcePageNumber" INTEGER,
  "sourceRowNumber" INTEGER,
  "date" TIMESTAMP(3),
  "dateConfidence" "NormalizationConfidence" NOT NULL DEFAULT 'LOW',
  "description" TEXT,
  "descriptionConfidence" "NormalizationConfidence" NOT NULL DEFAULT 'LOW',
  "reference" TEXT,
  "referenceConfidence" "NormalizationConfidence" NOT NULL DEFAULT 'LOW',
  "debit" DECIMAL(20,4),
  "credit" DECIMAL(20,4),
  "amount" DECIMAL(20,4),
  "balance" DECIMAL(20,4),
  "currency" TEXT,
  "currencyConfidence" "NormalizationConfidence" NOT NULL DEFAULT 'LOW',
  "transactionType" TEXT,
  "confidence" "NormalizationConfidence" NOT NULL DEFAULT 'LOW',
  "warnings" JSONB NOT NULL,
  "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "ignored" BOOLEAN NOT NULL DEFAULT false,
  "manuallyCorrected" BOOLEAN NOT NULL DEFAULT false,
  "correctedById" TEXT,
  "correctedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "normalized_transaction_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "normalized_transaction_candidates_documentId_sourceRowReference_key"
  ON "normalized_transaction_candidates"("documentId", "sourceRowReference");
CREATE INDEX "normalized_transaction_candidates_organizationId_companyId_documentId_idx"
  ON "normalized_transaction_candidates"("organizationId", "companyId", "documentId");
CREATE INDEX "normalized_transaction_candidates_companyId_possibleDuplicate_idx"
  ON "normalized_transaction_candidates"("companyId", "possibleDuplicate");
CREATE INDEX "normalized_transaction_candidates_documentId_createdAt_idx"
  ON "normalized_transaction_candidates"("documentId", "createdAt");

ALTER TABLE "normalized_transaction_candidates"
  ADD CONSTRAINT "normalized_transaction_candidates_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "normalized_transaction_candidates"
  ADD CONSTRAINT "normalized_transaction_candidates_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "normalized_transaction_candidates"
  ADD CONSTRAINT "normalized_transaction_candidates_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "normalized_transaction_candidates"
  ADD CONSTRAINT "normalized_transaction_candidates_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
