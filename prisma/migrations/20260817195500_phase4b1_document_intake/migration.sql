CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED', 'ARCHIVED');
CREATE TYPE "DocumentFileType" AS ENUM ('PDF', 'XLSX', 'XLS', 'CSV', 'JPG', 'JPEG', 'PNG', 'WEBP');
CREATE TABLE "documents" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "uploadedById" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL, "fileType" "DocumentFileType" NOT NULL, "mimeType" TEXT NOT NULL,
  "fileSize" BIGINT NOT NULL, "storageKey" TEXT NOT NULL, "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");
CREATE INDEX "documents_organizationId_companyId_createdAt_idx" ON "documents"("organizationId", "companyId", "createdAt");
CREATE INDEX "documents_companyId_documentStatus_idx" ON "documents"("companyId", "documentStatus");
CREATE INDEX "documents_uploadedById_idx" ON "documents"("uploadedById");
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
