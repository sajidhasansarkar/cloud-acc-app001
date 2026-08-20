"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageJournalEntries, canManageDocuments } from "@/lib/rbac";
import { finalizeUploadedDocument } from "@/accounting/documents";
import { runSmartImport, type SmartImportOutcome } from "@/documents/smart-import";

/**
 * Finalizes an already-uploaded (Vercel Blob) file into a Document row, then
 * immediately runs the full Smart Import pipeline against it. This is the
 * single action the "Smart Import" tab on Journal Entries > New calls after
 * the browser finishes uploading — there is no separate Documents page in
 * this flow.
 */
export async function smartImportFromBlobAction(
  companyId: string,
  storageKey: string,
  originalFileName: string,
  mimeType: string,
  guidance?: string
): Promise<SmartImportOutcome> {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageJournalEntries(role) || !canManageDocuments(role)) {
    return { ok: false, error: "You don't have permission to import documents into journal entries." };
  }
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const finalized = await finalizeUploadedDocument(organization.id, company.id, user.id, storageKey, originalFileName, mimeType);
  if (!finalized.ok) return { ok: false, error: finalized.error };

  const result = await runSmartImport(organization.id, company.id, user.id, finalized.document.id, guidance);

  if (result.ok) {
    revalidatePath(`/companies/${company.id}/journal-entries`);
    for (const entry of result.created) {
      revalidatePath(`/companies/${company.id}/journal-entries/${entry.journalEntryId}`);
    }
  }

  return result;
}

/**
 * For the "local" storage provider (dev only — production uses Vercel
 * Blob), the browser posts the file straight to the existing local-upload
 * route, which already creates the Document row. This action just runs the
 * Smart Import pipeline against that already-created document.
 */
export async function smartImportFromDocumentIdAction(
  companyId: string,
  documentId: string,
  guidance?: string
): Promise<SmartImportOutcome> {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageJournalEntries(role) || !canManageDocuments(role)) {
    return { ok: false, error: "You don't have permission to import documents into journal entries." };
  }
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const result = await runSmartImport(organization.id, company.id, user.id, documentId, guidance);

  if (result.ok) {
    revalidatePath(`/companies/${company.id}/journal-entries`);
    for (const entry of result.created) {
      revalidatePath(`/companies/${company.id}/journal-entries/${entry.journalEntryId}`);
    }
  }

  return result;
}
