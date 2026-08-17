"use server";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageDocuments } from "@/lib/rbac";
import { deleteDocument } from "@/accounting/documents";
import { processDocument } from "@/documents/processing";

export async function deleteDocumentAction(companyId: string, documentId: string) {
  const { role, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to manage documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await deleteDocument(organization.id, company.id, documentId);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents`);
  return result;
}

export async function retryDocumentProcessingAction(companyId: string, documentId: string) {
  const { role, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to manage documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await processDocument(organization.id, company.id, documentId);
  revalidatePath(`/companies/${company.id}/documents`);
  if (result.status === "PROCESSED") return { ok: true as const };
  return { ok: false as const, error: result.error ?? "Document processing failed. Please retry." };
}

export async function normalizeDocumentAction(companyId: string, documentId: string) {
  const { role, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to manage documents." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const { normalizeDocument } = await import("@/documents/normalization");
  const result = await normalizeDocument(organization.id, company.id, documentId);
  revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  if ("error" in result) return { ok: false as const, error: result.error };
  return { ok: true as const, ...result };
}

export async function updateNormalizedCandidateAction(companyId: string, documentId: string, candidateId: string, input: {
  date?: string | null;
  description?: string | null;
  reference?: string | null;
  debit?: string | null;
  credit?: string | null;
  amount?: string | null;
  currency?: string | null;
}) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to edit normalized data." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const { updateNormalizedCandidate } = await import("@/documents/normalization");
  const result = await updateNormalizedCandidate(organization.id, company.id, documentId, candidateId, input, user.id);
  if (!result.ok) return result;
  revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}
