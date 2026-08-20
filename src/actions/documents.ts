"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageDocuments } from "@/lib/rbac";
import { deleteDocument } from "@/accounting/documents";
import { classifyAccountingDocument, manuallyCorrectClassification } from "@/documents/classification";
import { extractOwnedDocumentContent, getExtractionPreview } from "@/documents/processing";
import { normalizeDocument } from "@/documents/normalization";
import type { AccountingDocumentType } from "@prisma/client";
import { CLASSIFIABLE_MANUAL_TYPES } from "@/documents/classification-config";

export async function deleteDocumentAction(companyId: string, documentId: string) {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to manage documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await deleteDocument(organization.id, company.id, documentId, user.id);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents`);
  return result;
}


export async function classifyDocumentAction(companyId: string, documentId: string, force = false) {
  const { role, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to classify documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await classifyAccountingDocument(documentId, force);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}

export async function correctDocumentClassificationAction(companyId: string, documentId: string, documentType: AccountingDocumentType) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to correct document classification." };
  if (!CLASSIFIABLE_MANUAL_TYPES.includes(documentType)) return { ok: false as const, error: "Invalid document type." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await manuallyCorrectClassification(organization.id, company.id, documentId, user.id, documentType);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}


export async function extractDocumentContentAction(companyId: string, documentId: string, force = false) {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to extract documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await extractOwnedDocumentContent(organization.id, company.id, documentId, user.id, force);
  revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  if (result.error) return { ok: false as const, error: result.error };
  return { ok: true as const, ...result };
}

// Phase 5A-9: normalizeDocument used to exist but was never invoked from any
// action, route, or UI element — extraction ran a "PROCESSING -> COMPLETED"
// pipeline that was, in effect, a dead end. This is the missing manual
// trigger (extraction now also calls it automatically on success, see
// src/documents/processing.ts).
export async function runDocumentAIExtractionAction(companyId: string, documentId: string) {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to process documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await normalizeDocument(organization.id, company.id, documentId, user.id);
  revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  if ("error" in result) return { ok: false as const, error: result.error };
  return { ok: true as const, ...result };
}

export async function getDocumentExtractionPreviewAction(companyId: string, documentId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return null;
  return getExtractionPreview(organization.id, company.id, documentId);
}
