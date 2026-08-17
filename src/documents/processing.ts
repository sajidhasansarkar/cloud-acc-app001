import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOwnedDocument } from "@/accounting/documents";
import { getDocumentStorage } from "@/storage/document-storage";
import type { DocumentFileType } from "@/documents/config";
import { PROCESSORS } from "@/documents/processors";
import type { DocumentProcessingResult, ProcessingContent } from "@/documents/processing-types";
import { normalizeDocument } from "@/documents/normalization";

const SAFE_ERROR = "Document processing failed. Please retry.";

function processingReference(companyId: string, documentId: string) {
  return `document-processing/${companyId}/${documentId}/${randomUUID()}.json`;
}

async function saveContent(companyId: string, documentId: string, content: ProcessingContent) {
  const key = processingReference(companyId, documentId);
  const storage = getDocumentStorage();
  const blob = new Blob([JSON.stringify(content)], { type: "application/json" });
  await storage.upload(key, blob);
  return key;
}

export async function processDocument(organizationId: string, companyId: string, documentId: string): Promise<DocumentProcessingResult> {
  const document = await getOwnedDocument(organizationId, companyId, documentId);
  if (!document) return { documentId, status: "FAILED", fileType: "PDF", metadata: { requiresOcr: false }, error: "Document not found." };
  if (document.documentStatus === "ARCHIVED") return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, error: "Archived documents cannot be processed." };
  if (document.documentStatus === "PROCESSING") return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, error: "Document is already processing." };

  await prisma.document.update({ where: { id: document.id }, data: { documentStatus: "PROCESSING" } });
  let newReference: string | undefined;
  try {
    const storage = getDocumentStorage();
    const buffer = await storage.read(document.storageKey);
    const processor = PROCESSORS[document.fileType as DocumentFileType];
    if (!processor) throw new Error("Unsupported processor.");
    const extracted = await processor(buffer);
    const previous = await prisma.documentProcessingResult.findUnique({ where: { documentId: document.id }, select: { extractedContentReference: true } });
    const reference = await saveContent(companyId, document.id, extracted.content);
    newReference = reference;
    const processedAt = new Date();
    await prisma.$transaction([
      prisma.documentProcessingResult.upsert({
        where: { documentId: document.id },
        create: {
          documentId: document.id,
          detectedFileType: document.fileType,
          pageCount: extracted.pageCount,
          sheetCount: extracted.sheetCount,
          rowCount: extracted.rowCount,
          columnCount: extracted.columnCount,
          requiresOcr: Boolean(extracted.requiresOcr),
          extractedContentReference: reference,
          processingError: null,
          processedAt,
        },
        update: {
          detectedFileType: document.fileType,
          pageCount: extracted.pageCount,
          sheetCount: extracted.sheetCount,
          rowCount: extracted.rowCount,
          columnCount: extracted.columnCount,
          requiresOcr: Boolean(extracted.requiresOcr),
          extractedContentReference: reference,
          processingError: null,
          processedAt,
        },
      }),
      prisma.document.update({ where: { id: document.id }, data: { documentStatus: "PROCESSED" } }),
    ]);
    if (previous?.extractedContentReference && previous.extractedContentReference !== reference) { try { await storage.delete(previous.extractedContentReference); } catch (cleanupError) { console.error("Old processing artifact cleanup failed", cleanupError); } }
    const normalization = await normalizeDocument(organizationId, companyId, document.id);
    if ("error" in normalization) console.warn("Document normalization deferred", normalization.error);
    return { documentId: document.id, status: "PROCESSED", fileType: document.fileType, metadata: { pageCount: extracted.pageCount, sheetCount: extracted.sheetCount, rowCount: extracted.rowCount, columnCount: extracted.columnCount, requiresOcr: Boolean(extracted.requiresOcr) }, extractedContentReference: reference, processedAt };
  } catch (error) {
    if (newReference) { try { await getDocumentStorage().delete(newReference); } catch (cleanupError) { console.error("Failed processing artifact cleanup", cleanupError); } }
    console.error("Document processing failed", error);
    await prisma.$transaction([
      prisma.documentProcessingResult.upsert({
        where: { documentId: document.id },
        create: { documentId: document.id, detectedFileType: document.fileType, requiresOcr: false, processingError: SAFE_ERROR },
        update: { processingError: SAFE_ERROR, processedAt: null },
      }),
      prisma.document.update({ where: { id: document.id }, data: { documentStatus: "FAILED" } }),
    ]);
    return { documentId: document.id, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, error: SAFE_ERROR };
  }
}
