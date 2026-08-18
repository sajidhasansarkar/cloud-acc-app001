"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageDocuments, canReviewAI } from "@/lib/rbac";
import { mapTransactionToAccounts, searchCompanyAccounts, selectMappedAccount, clearMappedAccount, acceptMappedAccounts, listTransactionMappings } from "@/mapping/transaction-account-mapping";

export async function mapTransactionToAccountsAction(companyId: string, documentId: string, candidateId: string, force = false) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role) && !canReviewAI(role)) return { ok: false as const, error: "You don't have permission to map accounts." };
  const result = await mapTransactionToAccounts(organization.id, companyId, documentId, candidateId, user.id, force);
  if (result.ok) revalidatePath(`/companies/${companyId}/documents/${documentId}`);
  return result;
}

export async function searchCompanyAccountsAction(companyId: string, query: string) {
  const { organization } = await requireActiveOrganization();
  return searchCompanyAccounts(organization.id, companyId, query);
}

export async function selectMappedAccountAction(companyId: string, documentId: string, candidateId: string, side: "DEBIT" | "CREDIT", accountId: string) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role) && !canReviewAI(role)) return { ok: false as const, error: "You don't have permission to change account mappings." };
  const result = await selectMappedAccount(organization.id, companyId, documentId, candidateId, side, accountId, user.id);
  if (result.ok) revalidatePath(`/companies/${companyId}/documents/${documentId}`);
  return result;
}

export async function clearMappedAccountAction(companyId: string, documentId: string, candidateId: string, side: "DEBIT" | "CREDIT") {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role) && !canReviewAI(role)) return { ok: false as const, error: "You don't have permission to change account mappings." };
  const result = await clearMappedAccount(organization.id, companyId, documentId, candidateId, side, user.id);
  if (result.ok) revalidatePath(`/companies/${companyId}/documents/${documentId}`);
  return result;
}

export async function acceptMappedAccountsAction(companyId: string, documentId: string, candidateId: string) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role) && !canReviewAI(role)) return { ok: false as const, error: "You don't have permission to accept account mappings." };
  const result = await acceptMappedAccounts(organization.id, companyId, documentId, candidateId, user.id);
  if (result.ok) revalidatePath(`/companies/${companyId}/documents/${documentId}`);
  return result;
}

export async function listTransactionMappingsAction(companyId: string, documentId: string) {
  const { organization } = await requireActiveOrganization();
  return listTransactionMappings(organization.id, companyId, documentId);
}
