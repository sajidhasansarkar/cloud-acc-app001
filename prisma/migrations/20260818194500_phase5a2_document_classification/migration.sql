-- Phase 5A-2: document classification and processing-router foundation.
CREATE TYPE "DocumentClassificationStatus" AS ENUM ('PENDING','CLASSIFYING','CLASSIFIED','CLASSIFICATION_FAILED','NEEDS_REVIEW','MANUALLY_REVIEWED');
CREATE TYPE "AccountingDocumentType" AS ENUM ('BANK_STATEMENT','INVOICE','BILL','RECEIPT','BALANCE_SHEET','INCOME_STATEMENT','TRIAL_BALANCE','GENERAL_LEDGER','TAX_DOCUMENT','PAYROLL_DOCUMENT','EXPENSE_REPORT','OTHER','UNKNOWN');
CREATE TYPE "ClassificationConfidence" AS ENUM ('HIGH','MEDIUM','LOW');
CREATE TYPE "DocumentProcessingRoute" AS ENUM ('BANK_STATEMENT_PROCESSOR','INVOICE_PROCESSOR','BILL_PROCESSOR','RECEIPT_PROCESSOR','FINANCIAL_STATEMENT_PROCESSOR','GENERAL_LEDGER_PROCESSOR','TAX_DOCUMENT_PROCESSOR','PAYROLL_DOCUMENT_PROCESSOR','EXPENSE_REPORT_PROCESSOR','OTHER_PROCESSOR','MANUAL_REVIEW');

CREATE TABLE "document_classifications" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" "DocumentClassificationStatus" NOT NULL DEFAULT 'PENDING',
  "documentType" "AccountingDocumentType" NOT NULL DEFAULT 'UNKNOWN',
  "confidence" "ClassificationConfidence" NOT NULL DEFAULT 'LOW',
  "reasoning" TEXT,
  "processingRoute" "DocumentProcessingRoute" NOT NULL DEFAULT 'MANUAL_REVIEW',
  "classifierMethod" TEXT,
  "classifierVersion" TEXT,
  "manuallyReviewed" BOOLEAN NOT NULL DEFAULT false,
  "correctedById" TEXT,
  "classifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_classifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_classifications_documentId_key" UNIQUE ("documentId"),
  CONSTRAINT "document_classifications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_classifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_classifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_classifications_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "document_classifications_organizationId_companyId_status_idx" ON "document_classifications"("organizationId","companyId","status");
CREATE INDEX "document_classifications_companyId_documentType_idx" ON "document_classifications"("companyId","documentType");
CREATE INDEX "document_classifications_companyId_processingRoute_idx" ON "document_classifications"("companyId","processingRoute");
CREATE INDEX "document_classifications_correctedById_idx" ON "document_classifications"("correctedById");
