CREATE TYPE "JournalPreparationStatus" AS ENUM ('PENDING', 'MAPPED', 'PARTIAL', 'NEEDS_REVIEW', 'READY_FOR_JOURNAL', 'FAILED');
CREATE TYPE "AccountMappingSource" AS ENUM ('AI', 'USER');

CREATE TABLE "transaction_account_mappings" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" "JournalPreparationStatus" NOT NULL DEFAULT 'PENDING',
  "aiDebitAccountId" TEXT,
  "aiCreditAccountId" TEXT,
  "selectedDebitAccountId" TEXT,
  "selectedCreditAccountId" TEXT,
  "debitSource" "AccountMappingSource",
  "creditSource" "AccountMappingSource",
  "debitConfidence" "NormalizationConfidence",
  "creditConfidence" "NormalizationConfidence",
  "reasoning" TEXT,
  "alternatives" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "duplicateWarning" BOOLEAN NOT NULL DEFAULT false,
  "taxContext" JSONB,
  "userSelectedById" TEXT,
  "userSelectedAt" TIMESTAMP(3),
  "aiMappedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transaction_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transaction_account_mappings_candidateId_key" ON "transaction_account_mappings"("candidateId");
CREATE INDEX "transaction_account_mappings_organizationId_companyId_status_idx" ON "transaction_account_mappings"("organizationId", "companyId", "status");
CREATE INDEX "transaction_account_mappings_documentId_updatedAt_idx" ON "transaction_account_mappings"("documentId", "updatedAt");
CREATE INDEX "transaction_account_mappings_companyId_aiDebitAccountId_idx" ON "transaction_account_mappings"("companyId", "aiDebitAccountId");
CREATE INDEX "transaction_account_mappings_companyId_aiCreditAccountId_idx" ON "transaction_account_mappings"("companyId", "aiCreditAccountId");

ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "normalized_transaction_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_aiDebitAccountId_fkey" FOREIGN KEY ("aiDebitAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_aiCreditAccountId_fkey" FOREIGN KEY ("aiCreditAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_selectedDebitAccountId_fkey" FOREIGN KEY ("selectedDebitAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_selectedCreditAccountId_fkey" FOREIGN KEY ("selectedCreditAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_account_mappings" ADD CONSTRAINT "transaction_account_mappings_userSelectedById_fkey" FOREIGN KEY ("userSelectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
