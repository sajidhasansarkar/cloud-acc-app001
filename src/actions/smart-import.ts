"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageJournalEntries, canManageDocuments, canReviewAI } from "@/lib/rbac";
import { finalizeUploadedDocument } from "@/accounting/documents";
import {
  runSmartImport,
  getSmartImportReviewData,
  confirmSmartImportCandidates,
  type SmartImportOutcome,
  type SmartImportConfirmation,
} from "@/documents/smart-import";

/**
 * Finalizes an already-uploaded (Vercel Blob) file into a Document row, then
 * stages it for Smart Import (classify -> extract -> normalize -> optional
 * AI account proposals). This is the action the "Smart Import" tab on
 * Journal Entries > New calls after the browser finishes uploading. It
 * never creates a Draft Journal Entry itself — the caller should route the
 * user to the Reconcile screen (`/journal-entries/new/review/[documentId]`)
 * to confirm before anything is created.
 */
export async function smartImportFromBlobAction(
  companyId: string,
  storageKey: string,
  originalFileName: string,
  mimeType: string,
  guidance?: string,
  proposeAccounts = true
): Promise<SmartImportOutcome> {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageJournalEntries(role) || !canManageDocuments(role)) {
    return { ok: false, error: "You don't have permission to import documents into journal entries." };
  }
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const finalized = await finalizeUploadedDocument(organization.id, company.id, user.id, storageKey, originalFileName, mimeType);
  if (!finalized.ok) return { ok: false, error: finalized.error };

  return runSmartImport(organization.id, company.id, user.id, finalized.document.id, guidance, proposeAccounts);
}

/**
 * For the "local" storage provider (dev only — production uses Vercel
 * Blob), the browser posts the file straight to the existing local-upload
 * route, which already creates the Document row. This action just runs the
 * staging half of the Smart Import pipeline against that already-created
 * document.
 */
export async function smartImportFromDocumentIdAction(
  companyId: string,
  documentId: string,
  guidance?: string,
  proposeAccounts = true
): Promise<SmartImportOutcome> {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageJournalEntries(role) || !canManageDocuments(role)) {
    return { ok: false, error: "You don't have permission to import documents into journal entries." };
  }
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  return runSmartImport(organization.id, company.id, user.id, documentId, guidance, proposeAccounts);
}

/** Loads the Reconcile-screen data for a staged Smart Import document. */
export async function getSmartImportReviewAction(companyId: string, documentId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const data = await getSmartImportReviewData(organization.id, company.id, documentId);
  if (!data) return { ok: false as const, error: "Document not found." };
  return { ok: true as const, data };
}

/**
 * The Reconcile screen's "Create Journal Entries" button — the single place
 * in this whole flow that actually creates anything. Requires the same
 * permissions as manually creating a journal entry plus reviewing AI
 * suggestions, matching the existing AI Review queue's rule that these are
 * separate capabilities.
 */
export async function confirmSmartImportAction(
  companyId: string,
  documentId: string,
  confirmations: SmartImportConfirmation[]
) {
  const { role, organization, user } = await requireActiveOrganization();
  if (!canManageJournalEntries(role) || !canReviewAI(role)) {
    return { ok: false as const, error: "You don't have permission to create journal entries from this import." };
  }
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };

  const result = await confirmSmartImportCandidates(organization.id, company.id, user.id, documentId, confirmations);
  if (result.ok) {
    revalidatePath(`/companies/${company.id}/journal-entries`);
    for (const entry of result.created) {
      revalidatePath(`/companies/${company.id}/journal-entries/${entry.journalEntryId}`);
    }
  }
  return result;
}
