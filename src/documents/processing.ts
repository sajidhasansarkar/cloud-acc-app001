import { randomUUID } from "node:crypto";
import type { DocumentFileType, DocumentExtractionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { getOwnedDocument } from "@/accounting/documents";
import { getDocumentStorage } from "@/storage/document-storage";
import { EXTRACTORS } from "@/documents/processors";
import type { DocumentProcessingResult, NormalizedDocumentContent } from "@/documents/processing-types";

const SAFE_ERROR = "Document extraction failed. Please retry.";
const UNSUPPORTED_ERROR = "This document type is not supported by the extraction engine yet.";

function processingReference(companyId: string, documentId: string) { return `document-extraction/${companyId}/${documentId}/${randomUUID()}.json`; }

async function audit(organizationId: string, companyId: string, documentId: string, userId: string, action: string, details?: Prisma.InputJsonValue) {
  try {
    await prisma.documentAuditEvent.create({ data: { id: randomUUID(), organizationId, companyId, documentId, userId, action, details } });
  } catch (error) {
    console.error("Document extraction audit failed", error);
  }
}

function safeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (message.includes("encrypted") || message.includes("password")) return "Encrypted or password-protected PDF cannot be extracted.";
  if (message.includes("invalid pdf") || message.includes("bad pdf")) return "The PDF appears to be corrupted or invalid.";
  if (message.includes("zip") || message.includes("workbook") || message.includes("central directory")) return "The spreadsheet appears to be invalid or corrupted.";
  return SAFE_ERROR;
}

async function saveContent(companyId: string, documentId: string, content: NormalizedDocumentContent) {
  const key = processingReference(companyId, documentId);
  const storage = getDocumentStorage();
  await storage.upload(key, new Blob([JSON.stringify(content)], { type: "application/json" }));
  return key;
}

async function extractionResult(documentId: string) {
  return prisma.documentProcessingResult.findUnique({ where: { documentId } });
}

export async function extractOwnedDocumentContent(organizationId: string, companyId: string, documentId: string, userId: string, force = false): Promise<DocumentProcessingResult> {
  const document = await getOwnedDocument(organizationId, companyId, documentId);
  if (!document) return { documentId, status: "FAILED", fileType: "PDF", metadata: { requiresOcr: false }, warnings: [], error: "Document not found." };
  if (document.documentStatus === "ARCHIVED") return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, warnings: [], error: "Archived documents cannot be extracted." };

  const classification = await prisma.documentClassification.findFirst({ where: { documentId: document.id, organizationId, companyId, document: { organizationId, companyId } }, select: { status: true, documentType: true } });
  if (!classification || !["CLASSIFIED", "MANUALLY_REVIEWED"].includes(classification.status)) {
    return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, warnings: [], error: "Document classification must be completed before extraction." };
  }

  const existing = await extractionResult(document.id);
  if (!force && existing?.extractionStatus === "PROCESSING") {
    return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: existing.requiresOcr }, warnings: [], error: "Document extraction is already in progress." };
  }
  if (!force && existing?.extractionStatus === "COMPLETED" && existing.extractedContentReference) {
    return { documentId, status: "COMPLETED", fileType: document.fileType, metadata: { pageCount: existing.pageCount ?? undefined, sheetCount: existing.sheetCount ?? undefined, tableCount: existing.tableCount ?? undefined, rowCount: existing.rowCount ?? undefined, columnCount: existing.columnCount ?? undefined, textBlockCount: existing.textBlockCount ?? undefined, requiresOcr: existing.requiresOcr }, warnings: Array.isArray(existing.warnings) ? existing.warnings.map(String) : [], extractedContentReference: existing.extractedContentReference, processedAt: existing.processedAt ?? undefined };
  }

  await prisma.documentProcessingResult.upsert({ where: { documentId: document.id }, create: { documentId: document.id, detectedFileType: document.fileType, extractionStatus: "PROCESSING", requiresOcr: false }, update: { extractionStatus: "PROCESSING", processingError: null } });
  await audit(organizationId, companyId, document.id, userId, "EXTRACTION_STARTED", { forced: force, fileType: document.fileType });

  let newReference: string | undefined;
  try {
    if (!document.storageKey.trim()) throw new Error("Missing storage reference.");
    const extractor = EXTRACTORS[document.fileType as DocumentFileType];
    if (!extractor) {
      const warnings = [UNSUPPORTED_ERROR];
      await prisma.documentProcessingResult.update({ where: { documentId: document.id }, data: { extractionStatus: "FAILED", processingError: UNSUPPORTED_ERROR, warnings, processedAt: null, requiresOcr: false } });
      await audit(organizationId, companyId, document.id, userId, "EXTRACTION_FAILED", { reason: UNSUPPORTED_ERROR });
      return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, warnings, error: UNSUPPORTED_ERROR };
    }
    const buffer = await getDocumentStorage().read(document.storageKey);
    if (!buffer.length) throw new Error("Empty document.");
    const extracted = await extractor(document.id, buffer, document.mimeType);
    const reference = await saveContent(companyId, document.id, extracted.content);
    newReference = reference;
    const warnings: string[] = extracted.content.warnings ?? [];
    const status: DocumentExtractionStatus = extracted.partial ? "PARTIAL" : "COMPLETED";
    const previous = existing?.extractedContentReference;
    await prisma.documentProcessingResult.update({ where: { documentId: document.id }, data: { detectedFileType: document.fileType, extractionStatus: status, pageCount: extracted.pageCount ?? null, sheetCount: extracted.sheetCount ?? null, tableCount: extracted.tableCount ?? null, rowCount: extracted.rowCount ?? null, columnCount: extracted.columnCount ?? null, textBlockCount: extracted.textBlockCount ?? null, requiresOcr: Boolean(extracted.requiresOcr), extractedContentReference: reference, processingError: null, warnings, processedAt: new Date() } });
    if (previous && previous !== reference) await getDocumentStorage().delete(previous).catch(() => undefined);
    await audit(organizationId, companyId, document.id, userId, status === "COMPLETED" ? "EXTRACTION_COMPLETED" : "EXTRACTION_PARTIAL", { status, warnings });
    return { documentId, status, fileType: document.fileType, metadata: { pageCount: extracted.pageCount, sheetCount: extracted.sheetCount, tableCount: extracted.tableCount, rowCount: extracted.rowCount, columnCount: extracted.columnCount, textBlockCount: extracted.textBlockCount, requiresOcr: Boolean(extracted.requiresOcr) }, warnings, extractedContentReference: reference, processedAt: new Date() };
  } catch (error) {
    if (newReference) await getDocumentStorage().delete(newReference).catch(() => undefined);
    const message = safeError(error);
    console.error("Document extraction failed", error);
    await prisma.documentProcessingResult.update({ where: { documentId: document.id }, data: { extractionStatus: "FAILED", processingError: message, warnings: [message], processedAt: null } });
    await audit(organizationId, companyId, document.id, userId, "EXTRACTION_FAILED", { reason: message });
    return { documentId, status: "FAILED", fileType: document.fileType, metadata: { requiresOcr: false }, warnings: [message], error: message };
  }
}

export async function extractDocumentContent(documentId: string, force = false) {
  const { organization, user } = await requireActiveOrganization();
  const scoped = await prisma.document.findFirst({ where: { id: documentId, organizationId: organization.id, company: { organizationId: organization.id } }, select: { id: true, companyId: true } });
  if (!scoped) return { documentId, status: "FAILED" as const, fileType: "PDF" as const, metadata: { requiresOcr: false }, warnings: [], error: "Document not found." };
  const company = await getOwnedCompany(organization.id, scoped.companyId);
  if (!company) return { documentId, status: "FAILED" as const, fileType: "PDF" as const, metadata: { requiresOcr: false }, warnings: [], error: "Document not found." };
  return extractOwnedDocumentContent(organization.id, company.id, scoped.id, user.id, force);
}

export async function getExtractionPreview(organizationId: string, companyId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId, companyId, company: { organizationId } }, select: { id: true, processingResult: true } });
  if (!document?.processingResult?.extractedContentReference) return null;
  const raw = await getDocumentStorage().read(document.processingResult.extractedContentReference);
  const content = JSON.parse(raw.toString("utf8")) as NormalizedDocumentContent;
  return {
    status: document.processingResult.extractionStatus,
    warnings: Array.isArray(document.processingResult.warnings) ? document.processingResult.warnings.map(String) : [],
    pages: content.pages.slice(0, 10).map((p) => ({ pageNumber: p.pageNumber, text: p.text.slice(0, 6000), tables: p.tables.slice(0, 5) })),
    sheets: content.sheets.slice(0, 10).map((s) => ({ name: s.name, columns: s.columns.slice(0, 50), rows: s.rows.slice(0, 100) })),
    tables: content.tables.slice(0, 20),
    rows: content.rows.slice(0, 200),
    columns: content.columns.slice(0, 100),
    textBlocks: content.textBlocks.slice(0, 200),
  };
}
