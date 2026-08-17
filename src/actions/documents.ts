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
