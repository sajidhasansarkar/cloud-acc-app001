import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { getDocumentStorage } from "@/storage/document-storage";
import { validateDocumentFile } from "@/documents/validation";

export async function listDocuments(organizationId: string, companyId: string) {
  return prisma.document.findMany({
    where: { organizationId, companyId, company: { organizationId } },
    select: {
      id: true, originalFileName: true, fileType: true, fileSize: true, documentStatus: true, createdAt: true,
      uploadedBy: { select: { name: true } },
      processingResult: { select: { pageCount: true, sheetCount: true, rowCount: true, columnCount: true, requiresOcr: true, processingError: true, processedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOwnedDocument(organizationId: string, companyId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId, company: { organizationId } },
    select: { id: true, storageKey: true, fileType: true, documentStatus: true },
  });
}

export async function getOwnedDocumentDetails(organizationId: string, companyId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId, company: { organizationId } },
    select: {
      id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, documentStatus: true, createdAt: true, updatedAt: true,
      uploadedBy: { select: { name: true } },
      processingResult: { select: { pageCount: true, sheetCount: true, rowCount: true, columnCount: true, requiresOcr: true, processingError: true, processedAt: true } },
    },
  });
}

export async function createDocument(organizationId: string, companyId: string, uploadedById: string, file: File) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const validation = await validateDocumentFile(file);
  if (!validation.ok) return validation;
  const documentId = randomUUID();
  const extension = file.name.toLowerCase().split(".").pop()!;
  const storageKey = `documents/${companyId}/${documentId}/${randomUUID()}.${extension}`;
  const storage = getDocumentStorage();
  try {
    await storage.upload(storageKey, file);
    const document = await prisma.document.create({
      data: { id: documentId, organizationId, companyId: company.id, uploadedById, originalFileName: file.name.trim(), fileType: validation.fileType, mimeType: validation.mimeType, fileSize: BigInt(file.size), storageKey, documentStatus: "UPLOADED" },
      select: { id: true, originalFileName: true, fileType: true, mimeType: true, fileSize: true, documentStatus: true, createdAt: true, uploadedBy: { select: { name: true } } },
    });
    return { ok: true as const, document };
  } catch (error) {
    try { await storage.delete(storageKey); } catch { /* best effort */ }
    console.error("Document upload failed", error);
    return { ok: false as const, error: "Upload failed. Please try again." };
  }
}

export async function deleteDocument(organizationId: string, companyId: string, documentId: string) {
  const document = await getOwnedDocument(organizationId, companyId, documentId);
  if (!document) return { ok: false as const, error: "Document not found." };
  const storage = getDocumentStorage();
  try {
    await storage.delete(document.storageKey);
    await prisma.document.delete({ where: { id: document.id } });
    return { ok: true as const };
  } catch (error) {
    console.error("Document deletion failed", error);
    return { ok: false as const, error: "Unable to delete the document. Please try again." };
  }
}
