"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { prisma } from "@/lib/prisma";
import { canManageDocuments, canReviewAI } from "@/lib/rbac";
import { buildAccountingAIContext } from "@/ai/context";
import { acceptAccountingAISuggestion, editAccountingAISuggestion, generateAccountingAISuggestion, getAccountingAIReview, rejectAccountingAISuggestion } from "@/ai/review";

type AIReviewSuggestionWithAccount = Prisma.AIReviewSuggestionGetPayload<{
  include: {
    suggestedAccount: { select: { id: true, code: true, name: true, type: true } };
  };
}>;

type AIReviewAuditWithUser = Prisma.AIReviewAuditGetPayload<{
  select: {
    id: true;
    action: true;
    provider: true;
    model: true;
    contextVersion: true;
    confidence: true;
    createdAt: true;
    user: { select: { id: true, name: true } };
  };
}>;

export async function generateAIReviewAction(companyId: string, documentId: string, candidateId: string) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canManageDocuments(role)) return { ok: false as const, error: "You don't have permission to run AI review." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await generateAccountingAISuggestion(organization.id, company.id, documentId, candidateId, user.id);
  revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}

export async function retryAIReviewAction(companyId: string, documentId: string, candidateId: string) {
  return generateAIReviewAction(companyId, documentId, candidateId);
}

// Compatibility alias: some UI components (outside Phase 4B-6's scope)
// reference "prepareAIReviewAction" — same signature/behavior as running
// AI review generation. Kept as an alias rather than a duplicate
// implementation so there is exactly one place the review-generation logic
// lives.
export const prepareAIReviewAction = generateAIReviewAction;

export async function getAIReviewContextAction(companyId: string, documentId: string, candidateId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const payload = await buildAccountingAIContext(organization.id, company.id, documentId, candidateId);
  if (!payload) return { ok: false as const, error: "Transaction candidate not found." };
  return { ok: true as const, payload };
}

export async function getAIReviewAction(companyId: string, documentId: string, candidateId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const review = await getAccountingAIReview(organization.id, company.id, documentId, candidateId);
  if (!review) return { ok: false as const, error: "Transaction candidate not found." };
  const serialized = {
    ...review,
    reviewedAt: review.reviewedAt?.toISOString() ?? null,
    humanDebit: review.humanDebit?.toString() ?? null,
    humanCredit: review.humanCredit?.toString() ?? null,
    humanAmount: review.humanAmount?.toString() ?? null,
    suggestions: review.suggestions.map((suggestion: AIReviewSuggestionWithAccount) => ({
      ...suggestion,
      suggestedDebit: suggestion.suggestedDebit?.toString() ?? null,
      suggestedCredit: suggestion.suggestedCredit?.toString() ?? null,
      suggestedAmount: suggestion.suggestedAmount?.toString() ?? null,
    })),
    audits: review.audits.map((audit: AIReviewAuditWithUser) => ({ ...audit, createdAt: audit.createdAt.toISOString() })),
  };
  return { ok: true as const, review: serialized };
}

export async function getAIReviewAccountsAction(companyId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const accounts = await prisma.account.findMany({
    where: { companyId: company.id, company: { organizationId: organization.id }, isActive: true },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
  return { ok: true as const, accounts };
}

export async function acceptAIReviewAction(companyId: string, documentId: string, candidateId: string) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canReviewAI(role)) return { ok: false as const, error: "You don't have permission to review AI suggestions." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await acceptAccountingAISuggestion(organization.id, company.id, documentId, candidateId, user.id);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}

export async function rejectAIReviewAction(companyId: string, documentId: string, candidateId: string, notes?: string | null) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canReviewAI(role)) return { ok: false as const, error: "You don't have permission to review AI suggestions." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await rejectAccountingAISuggestion(organization.id, company.id, documentId, candidateId, user.id, notes);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}

export async function editAIReviewAction(companyId: string, documentId: string, candidateId: string, input: { accountId?: string | null; debit?: string | null; credit?: string | null; amount?: string | null; notes?: string | null }) {
  const { role, user, organization } = await requireActiveOrganization();
  if (!canReviewAI(role)) return { ok: false as const, error: "You don't have permission to review AI suggestions." };
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const result = await editAccountingAISuggestion(organization.id, company.id, documentId, candidateId, user.id, input);
  if (result.ok) revalidatePath(`/companies/${company.id}/documents/${documentId}`);
  return result;
}
