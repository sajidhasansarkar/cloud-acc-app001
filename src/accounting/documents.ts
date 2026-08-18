import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { getDocumentStorage } from "@/storage/document-storage";
import { classifyOwnedAccountingDocument } from "@/documents/classification";
import { validateDocumentFile } from "@/documents/validation";

const PAGE_SIZE = 25;

async function hashFile(file: File) {
  return createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
}

async function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function audit(documentId: string, organizationId: string, companyId: string, userId: string, action: string, details?: Prisma.InputJsonValue) {
  await prisma.documentAuditEvent.create({ data: { documentId, organizationId, companyId, userId, action, details } });
}

export async function listDocuments(organizationId: string, companyId: string, page = 1) {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const where = { organizationId, companyId };

  // The Document row already contains both tenant ownership keys. Do not add
  // a second ownership hop through Company here: apart from being redundant,
  // that relation filter can make an otherwise valid documents query fail when
  // a deployed Prisma schema/database is briefly out of sync.
  try {
    const [documents, total] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        select: {
          id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, documentStatus: true, createdAt: true,
          uploadedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.document.count({ where }),
    ]);
    return { documents, total, page: safePage, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  } catch (error) {
    // Keep the user-facing page generic, but make the real server error
    // visible in Vercel logs for diagnosis instead of silently swallowing it.
    console.error("Failed to list company documents", { organizationId, companyId, page: safePage, error });
    throw error;
  }
}

export async function getOwnedDocument(organizationId: string, companyId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId, company: { organizationId } },
    select: { id: true, storageKey: true, fileType: true, mimeType: true, originalFileName: true, documentStatus: true },
  });
}

export async function getOwnedDocumentDetails(organizationId: string, companyId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId, company: { organizationId } },
    select: {
      id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, fileHash: true, documentStatus: true, createdAt: true, updatedAt: true,
      uploadedBy: { select: { name: true } },
      company: { select: { displayName: true } },
      classification: { select: { status: true, documentType: true, confidence: true, reasoning: true, processingRoute: true, classifierMethod: true, manuallyReviewed: true, classifiedAt: true, correctedBy: { select: { name: true } } } },
      processingResult: { select: { extractionStatus: true, pageCount: true, sheetCount: true, tableCount: true, rowCount: true, columnCount: true, textBlockCount: true, requiresOcr: true, extractedContentReference: true, processingError: true, warnings: true, processedAt: true } },
      normalizedCandidates: {
        orderBy: [{ sourcePageNumber: "asc" }, { sourceRowNumber: "asc" }, { createdAt: "asc" }],
        include: {
          accountMapping: { include: { aiDebitAccount: { select: { id: true, code: true, name: true, type: true } }, aiCreditAccount: { select: { id: true, code: true, name: true, type: true } }, selectedDebitAccount: { select: { id: true, code: true, name: true, type: true } }, selectedCreditAccount: { select: { id: true, code: true, name: true, type: true } }, userSelectedBy: { select: { id: true, name: true } } } },
          aiReview: { select: { status: true, suggestions: { orderBy: { createdAt: "desc" }, take: 1, select: { confidence: true } } } },
        },
      },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, details: true, createdAt: true, user: { select: { name: true } } } },
    },
  });
}

export async function createDocument(organizationId: string, companyId: string, uploadedById: string, file: File) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const validation = await validateDocumentFile(file);
  if (!validation.ok) {
    await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName: file.name, reason: validation.error } } });
    return validation;
  }
  const fileHash = await hashFile(file);
  const duplicate = await prisma.document.findFirst({ where: { organizationId, companyId: company.id, fileHash }, select: { id: true, originalFileName: true, createdAt: true } });
  if (duplicate) {
    await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName: file.name, reason: "DUPLICATE_FILE", duplicateDocumentId: duplicate.id } } });
    return { ok: false as const, duplicate: true as const, error: "This file has already been uploaded for this company." };
  }

  const documentId = randomUUID();
  const extension = file.name.toLowerCase().split(".").pop()!;
  const storageKey = `documents/${companyId}/${documentId}/${randomUUID()}.${extension}`;
  const storage = getDocumentStorage();
  try {
    await storage.upload(storageKey, file);
    const document = await prisma.document.create({
      data: { id: documentId, organizationId, companyId: company.id, uploadedById, originalFileName: file.name.trim(), fileType: validation.fileType, mimeType: validation.mimeType, fileSize: BigInt(file.size), storageKey, fileHash, documentStatus: "UPLOADED" },
      select: { id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, documentStatus: true, createdAt: true, uploadedBy: { select: { name: true } } },
    });
    await audit(document.id, organizationId, company.id, uploadedById, "DOCUMENT_UPLOADED", { originalFileName: document.originalFileName, fileSize: document.fileSize.toString(), fileType: document.fileType }).catch((auditError) => console.error("Document upload audit failed", auditError));
    await classifyOwnedAccountingDocument(organizationId, company.id, document.id, uploadedById).catch((classificationError) => console.error("Document classification after upload failed", classificationError));
    return { ok: true as const, document };
  } catch (error) {
    try { await storage.delete(storageKey); } catch { /* best effort */ }
    const duplicateRace = (error as { code?: string }).code === "P2002";
    console.error("Document upload failed", error);
    await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName: file.name, reason: duplicateRace ? "DUPLICATE_FILE" : "STORAGE_OR_DATABASE_ERROR" } } }).catch(() => undefined);
    return duplicateRace ? { ok: false as const, duplicate: true as const, error: "This file has already been uploaded for this company." } : { ok: false as const, error: "Upload failed. Please try again." };
  }
}

export async function finalizeUploadedDocument(organizationId: string, companyId: string, uploadedById: string, storageKey: string, originalFileName: string, mimeType: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const expectedPrefix = `documents/${companyId}/`;
  if (!storageKey.startsWith(expectedPrefix) || storageKey.includes("..") || storageKey.includes("\\")) return { ok: false as const, error: "Invalid storage key." };
  const existing = await prisma.document.findUnique({ where: { storageKey }, select: { id: true } });
  if (existing) return { ok: false as const, error: "This upload has already been finalized." };
  const storage = getDocumentStorage();
  try {
    const buffer = await storage.read(storageKey);
    const file = new File([Uint8Array.from(buffer)], originalFileName.trim(), { type: mimeType.toLowerCase() });
    const validation = await validateDocumentFile(file);
    if (!validation.ok) {
      await storage.delete(storageKey);
      await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName, reason: validation.error } } });
      return validation;
    }
    const fileHash = await hashBuffer(buffer);
    const duplicate = await prisma.document.findFirst({ where: { organizationId, companyId: company.id, fileHash }, select: { id: true } });
    if (duplicate) {
      await storage.delete(storageKey);
      await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName, reason: "DUPLICATE_FILE", duplicateDocumentId: duplicate.id } } });
      return { ok: false as const, duplicate: true as const, error: "This file has already been uploaded for this company." };
    }

    const documentId = randomUUID();
    const document = await prisma.document.create({
      data: { id: documentId, organizationId, companyId: company.id, uploadedById, originalFileName: file.name, fileType: validation.fileType, mimeType: validation.mimeType, fileSize: BigInt(file.size), storageKey, fileHash, documentStatus: "UPLOADED" },
      select: { id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, documentStatus: true, createdAt: true, uploadedBy: { select: { name: true } } },
    });
    await audit(document.id, organizationId, company.id, uploadedById, "DOCUMENT_UPLOADED", { originalFileName: document.originalFileName, fileSize: document.fileSize.toString(), fileType: document.fileType }).catch((auditError) => console.error("Document upload audit failed", auditError));
    await classifyOwnedAccountingDocument(organizationId, company.id, document.id, uploadedById).catch((classificationError) => console.error("Document classification after upload failed", classificationError));
    return { ok: true as const, document };
  } catch (error) {
    try { await storage.delete(storageKey); } catch { /* best effort */ }
    const duplicateRace = (error as { code?: string }).code === "P2002";
    console.error("Document upload finalization failed", error);
    await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, userId: uploadedById, action: "UPLOAD_FAILED", details: { originalFileName, reason: duplicateRace ? "DUPLICATE_FILE" : "FINALIZATION_ERROR" } } }).catch(() => undefined);
    return duplicateRace ? { ok: false as const, duplicate: true as const, error: "This file has already been uploaded for this company." } : { ok: false as const, error: "Upload finalization failed. Please try again." };
  }
}

export async function deleteDocument(organizationId: string, companyId: string, documentId: string, userId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId, companyId, company: { organizationId } }, select: { id: true, storageKey: true, originalFileName: true } });
  if (!document) return { ok: false as const, error: "Document not found." };
  const storage = getDocumentStorage();
  try {
    await storage.delete(document.storageKey);
    await prisma.document.delete({ where: { id: document.id } });
    await prisma.documentAuditEvent.create({ data: { organizationId, companyId, userId, action: "DOCUMENT_REMOVED", details: { documentId: document.id, originalFileName: document.originalFileName } } }).catch((auditError: unknown) => console.error("Document removal audit failed", auditError));
    return { ok: true as const };
  } catch (error) {
    console.error("Document deletion failed", error);
    return { ok: false as const, error: "Unable to remove the document. Please try again." };
  }
}
