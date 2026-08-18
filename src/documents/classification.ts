import { randomUUID } from "node:crypto";
import type { AccountingDocumentType, ClassificationConfidence, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { CLASSIFICATION_CONFIDENCE_THRESHOLD, CLASSIFIER_VERSION, processingRouteFor } from "@/documents/classification-config";
import { metadataDocumentClassifier } from "@/documents/classifier";
import type { ClassificationResult } from "@/documents/classification-types";

const SAFE_ERROR = "Document classification failed. Please retry.";

async function audit(organizationId: string, companyId: string, documentId: string, userId: string, action: string, details?: Prisma.InputJsonValue) {
  await prisma.documentAuditEvent.create({ data: { id: randomUUID(), organizationId, companyId, documentId, userId, action, details } });
}

async function getScopedDocument(organizationId: string, documentId: string) {
  return prisma.document.findFirst({
    where: { id: documentId, organizationId, company: { organizationId } },
    select: { id: true, companyId: true, originalFileName: true, fileType: true, mimeType: true, documentStatus: true },
  });
}

export async function classifyOwnedAccountingDocument(organizationId: string, companyId: string, documentId: string, userId: string, force = false) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId, company: { organizationId } },
    select: { id: true, companyId: true, originalFileName: true, fileType: true, mimeType: true, storageKey: true, documentStatus: true, classification: true },
  });
  if (!document) return { ok: false as const, error: "Document not found." };
  if (document.documentStatus === "ARCHIVED") return { ok: false as const, error: "Archived documents cannot be classified." };
  if (!document.storageKey.trim()) return { ok: false as const, error: "Document storage reference is missing." };
  if (!force && document.classification?.status === "CLASSIFIED") return { ok: true as const, classification: document.classification, skipped: true as const };
  if (!force && document.classification?.status === "MANUALLY_REVIEWED") return { ok: true as const, classification: document.classification, skipped: true as const };

  await prisma.documentClassification.upsert({
    where: { documentId: document.id },
    create: { documentId: document.id, organizationId, companyId, status: "CLASSIFYING", documentType: "UNKNOWN", confidence: "LOW", processingRoute: "MANUAL_REVIEW", classifierMethod: "METADATA_RULES", classifierVersion: CLASSIFIER_VERSION },
    update: { status: "CLASSIFYING", classifierMethod: "METADATA_RULES", classifierVersion: CLASSIFIER_VERSION },
  });
  await audit(organizationId, companyId, document.id, userId, "DOCUMENT_CLASSIFICATION_STARTED", { method: "METADATA_RULES", forced: force });

  try {
    const result = await metadataDocumentClassifier.classify({ originalFileName: document.originalFileName, fileType: document.fileType, mimeType: document.mimeType });
    const classification = await prisma.documentClassification.update({
      where: { documentId: document.id },
      data: {
        status: result.documentType === "UNKNOWN" || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "HIGH" && result.confidence !== "HIGH") || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "MEDIUM" && result.confidence === "LOW") ? "NEEDS_REVIEW" : "CLASSIFIED",
        documentType: result.documentType,
        confidence: result.confidence,
        reasoning: result.reasoning,
        processingRoute: result.documentType === "UNKNOWN" || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "HIGH" && result.confidence !== "HIGH") || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "MEDIUM" && result.confidence === "LOW") ? "MANUAL_REVIEW" : result.processingRoute,
        classifierMethod: result.method,
        classifierVersion: CLASSIFIER_VERSION,
        manuallyReviewed: false,
        correctedById: null,
        classifiedAt: new Date(),
      },
    });
    await audit(organizationId, companyId, document.id, userId, "DOCUMENT_CLASSIFIED", { documentType: result.documentType, confidence: result.confidence, processingRoute: classification.processingRoute, method: result.method });
    return { ok: true as const, classification, skipped: false as const };
  } catch (error) {
    console.error("Document classification failed", error);
    const classification = await prisma.documentClassification.update({ where: { documentId: document.id }, data: { status: "CLASSIFICATION_FAILED", documentType: "UNKNOWN", confidence: "LOW", reasoning: SAFE_ERROR, processingRoute: "MANUAL_REVIEW", classifiedAt: null } });
    await audit(organizationId, companyId, document.id, userId, "DOCUMENT_CLASSIFICATION_FAILED", { error: SAFE_ERROR });
    return { ok: false as const, error: SAFE_ERROR, classification };
  }
}

export async function classifyAccountingDocument(documentId: string, force = false) {
  const { organization, user } = await requireActiveOrganization();
  const document = await getScopedDocument(organization.id, documentId);
  if (!document) return { ok: false as const, error: "Document not found." };
  const company = await getOwnedCompany(organization.id, document.companyId);
  if (!company) return { ok: false as const, error: "Document not found." };
  return classifyOwnedAccountingDocument(organization.id, company.id, document.id, user.id, force);
}

export async function manuallyCorrectClassification(organizationId: string, companyId: string, documentId: string, userId: string, documentType: AccountingDocumentType) {
  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId, companyId, company: { organizationId } }, select: { id: true, companyId: true, documentStatus: true, classification: { select: { status: true, documentType: true, confidence: true } } } });
  if (!document) return { ok: false as const, error: "Document not found." };
  if (document.documentStatus === "ARCHIVED") return { ok: false as const, error: "Archived documents cannot be classified." };
  if (document.classification && !classificationNeedsReview(document.classification.status, document.classification.confidence, document.classification.documentType)) {
    return { ok: false as const, error: "Manual correction is only available when classification requires review." };
  }
  const classification = await prisma.documentClassification.upsert({
    where: { documentId: document.id },
    create: { documentId: document.id, organizationId, companyId, status: "MANUALLY_REVIEWED", documentType, confidence: "HIGH", reasoning: "Classification was selected manually by an authorized user.", processingRoute: processingRouteFor(documentType), classifierMethod: "MANUAL", classifierVersion: CLASSIFIER_VERSION, manuallyReviewed: true, correctedById: userId, classifiedAt: new Date() },
    update: { status: "MANUALLY_REVIEWED", documentType, confidence: "HIGH", reasoning: "Classification was selected manually by an authorized user.", processingRoute: processingRouteFor(documentType), classifierMethod: "MANUAL", classifierVersion: CLASSIFIER_VERSION, manuallyReviewed: true, correctedById: userId, classifiedAt: new Date() },
  });
  await audit(organizationId, companyId, document.id, userId, "DOCUMENT_CLASSIFICATION_CORRECTED", { documentType, processingRoute: classification.processingRoute });
  return { ok: true as const, classification };
}

export function classificationNeedsReview(status: string, confidence: ClassificationConfidence, documentType: AccountingDocumentType) {
  return status === "CLASSIFICATION_FAILED" || status === "NEEDS_REVIEW" || documentType === "UNKNOWN" || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "HIGH" && confidence !== "HIGH") || (CLASSIFICATION_CONFIDENCE_THRESHOLD === "MEDIUM" && confidence === "LOW");
}
