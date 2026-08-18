-- Phase 5A-1: Document Upload Center foundation.
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'UPLOADING';
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "DocumentFileType" ADD VALUE IF NOT EXISTS 'DOC';
ALTER TYPE "DocumentFileType" ADD VALUE IF NOT EXISTS 'DOCX';
ALTER TYPE "DocumentFileType" ADD VALUE IF NOT EXISTS 'TIFF';

ALTER TABLE "documents" ADD COLUMN "fileHash" TEXT NOT NULL DEFAULT '';
UPDATE "documents" SET "fileHash" = 'legacy:' || "id" WHERE "fileHash" = '';
ALTER TABLE "documents" ALTER COLUMN "fileHash" DROP DEFAULT;
CREATE INDEX "documents_companyId_fileHash_idx" ON "documents"("companyId", "fileHash");
CREATE UNIQUE INDEX "documents_companyId_fileHash_key" ON "documents"("companyId", "fileHash");

CREATE TABLE "document_audit_events" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_audit_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "document_audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "document_audit_events_organizationId_companyId_createdAt_idx" ON "document_audit_events"("organizationId", "companyId", "createdAt");
CREATE INDEX "document_audit_events_documentId_createdAt_idx" ON "document_audit_events"("documentId", "createdAt");
