import { Prisma, type AIReviewDecision } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnedAccount, getOwnedCompany } from "@/accounting/access";
import { buildAccountingAIContext } from "@/ai/context";
import { ACCOUNTING_REVIEW_VERSION, getAccountingAIProvider } from "@/ai/provider";

const moneySchema = z.string().trim().regex(/^\d+(?:\.\d{1,4})?$/, "Invalid non-negative monetary value.");
const suggestionSchema = z.object({
  suggestedAccountId: z.string().cuid().optional(),
  suggestedDebit: moneySchema.optional(),
  suggestedCredit: moneySchema.optional(),
  suggestedAmount: moneySchema.optional(),
  explanation: z.string().trim().min(1).max(1000),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  warnings: z.array(z.string().trim().min(1).max(300)).max(30),
  alternatives: z.array(z.object({ accountId: z.string().cuid(), code: z.string().min(1).max(50), name: z.string().min(1).max(200), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]) })).max(5),
});

function decimal(value?: string) {
  return value === undefined ? undefined : new Prisma.Decimal(value);
}

function validateDirection(values: { debit?: string; credit?: string }) {
  if (values.debit !== undefined && values.credit !== undefined && new Prisma.Decimal(values.debit).gt(0) && new Prisma.Decimal(values.credit).gt(0)) {
    return "Debit and credit cannot both be populated in a single AI direction suggestion.";
  }
  return null;
}

function validateAgainstCandidate(candidate: { amount: Prisma.Decimal | null; debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }, suggestion: { suggestedAmount?: string; suggestedDebit?: string; suggestedCredit?: string }) {
  if (candidate.amount !== null) {
    if (suggestion.suggestedAmount === undefined || !candidate.amount.eq(new Prisma.Decimal(suggestion.suggestedAmount))) {
      return "AI suggested an amount different from the normalized source amount.";
    }
  }
  if (candidate.debit !== null) {
    if (suggestion.suggestedDebit === undefined || !candidate.debit.eq(new Prisma.Decimal(suggestion.suggestedDebit))) return "AI changed the normalized debit amount.";
    if (suggestion.suggestedCredit !== undefined && new Prisma.Decimal(suggestion.suggestedCredit).gt(0)) return "AI changed a debit transaction into a credit.";
  }
  if (candidate.credit !== null) {
    if (suggestion.suggestedCredit === undefined || !candidate.credit.eq(new Prisma.Decimal(suggestion.suggestedCredit))) return "AI changed the normalized credit amount.";
    if (suggestion.suggestedDebit !== undefined && new Prisma.Decimal(suggestion.suggestedDebit).gt(0)) return "AI changed a credit transaction into a debit.";
  }
  return null;
}

async function loadScopedCandidate(organizationId: string, companyId: string, documentId: string, candidateId: string) {
  return prisma.normalizedTransactionCandidate.findFirst({
    where: {
      id: candidateId,
      documentId,
      companyId,
      organizationId,
      document: { id: documentId, companyId, organizationId, company: { organizationId } },
    },
    include: { aiReview: true },
  });
}

async function validateAccounts(organizationId: string, companyId: string, accountIds: string[]) {
  const uniqueIds = [...new Set(accountIds)];
  if (!uniqueIds.length) return [];
  const accounts = await prisma.account.findMany({
    where: { id: { in: uniqueIds }, companyId, company: { organizationId }, isActive: true },
    select: { id: true, code: true, name: true, type: true },
  });
  if (accounts.length !== uniqueIds.length) throw new Error("One or more suggested accounts are invalid for this company.");
  return accounts;
}

export async function generateAccountingAISuggestion(
  organizationId: string,
  companyId: string,
  documentId: string,
  candidateId: string,
  userId: string
) {
  const candidate = await loadScopedCandidate(organizationId, companyId, documentId, candidateId);
  if (!candidate) return { ok: false as const, error: "Transaction candidate not found." };

  const payload = await buildAccountingAIContext(organizationId, companyId, documentId, candidateId);
  if (!payload) return { ok: false as const, error: "Transaction candidate not found." };

  const provider = getAccountingAIProvider();
  const review = await prisma.aIReviewRecord.upsert({
    where: { candidateId },
    create: { candidateId, status: "REVIEWING", provider: provider.provider, model: provider.model, contextVersion: ACCOUNTING_REVIEW_VERSION, createdById: userId },
    update: { status: "REVIEWING", provider: provider.provider, model: provider.model, contextVersion: ACCOUNTING_REVIEW_VERSION, createdById: userId, decision: null, reviewedById: null, reviewedAt: null, humanAccountId: null, humanDebit: null, humanCredit: null, humanAmount: null, humanNotes: null },
  });

  try {
    const raw = await provider.review(payload);
    const parsed = suggestionSchema.safeParse(raw);
    if (!parsed.success) throw new Error("AI response failed structured validation.");
    const suggestion = parsed.data;
    const directionError = validateDirection({ debit: suggestion.suggestedDebit, credit: suggestion.suggestedCredit });
    if (directionError) throw new Error(directionError);
    const sourceError = validateAgainstCandidate(candidate, suggestion);
    if (sourceError) throw new Error(sourceError);

    const accountIds = [suggestion.suggestedAccountId, ...suggestion.alternatives.map((item) => item.accountId)].filter((value): value is string => Boolean(value));
    const accounts = await validateAccounts(organizationId, companyId, accountIds);
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    if (suggestion.suggestedAccountId && !accountMap.has(suggestion.suggestedAccountId)) throw new Error("AI suggested an account outside the current company.");
    for (const alternative of suggestion.alternatives) {
      const account = accountMap.get(alternative.accountId);
      if (!account) throw new Error("AI suggested an alternative account outside the current company.");
      if (account.code !== alternative.code || account.name !== alternative.name) throw new Error("AI returned an account code or name that does not match the company Chart of Accounts.");
    }

    const suggestionRow = await prisma.aIReviewSuggestion.create({
      data: {
        candidateId,
        provider: provider.provider,
        model: provider.model,
        contextVersion: ACCOUNTING_REVIEW_VERSION,
        suggestedAccountId: suggestion.suggestedAccountId,
        suggestedDebit: decimal(suggestion.suggestedDebit),
        suggestedCredit: decimal(suggestion.suggestedCredit),
        suggestedAmount: decimal(suggestion.suggestedAmount),
        explanation: suggestion.explanation,
        confidence: suggestion.confidence,
        warnings: suggestion.warnings,
        alternatives: suggestion.alternatives,
      },
      select: { id: true },
    });

    const status = suggestion.confidence === "LOW" || suggestion.warnings.length ? "NEEDS_HUMAN_REVIEW" : "NEEDS_HUMAN_REVIEW";
    await prisma.aIReviewRecord.update({ where: { id: review.id }, data: { status, provider: provider.provider, model: provider.model, contextVersion: ACCOUNTING_REVIEW_VERSION } });
    await prisma.aIReviewAudit.create({
      data: {
        candidateId,
        suggestionId: suggestionRow.id,
        action: "GENERATED",
        provider: provider.provider,
        model: provider.model,
        contextVersion: ACCOUNTING_REVIEW_VERSION,
        confidence: suggestion.confidence,
        userId,
      },
    });

    return { ok: true as const, suggestionId: suggestionRow.id, status: "NEEDS_HUMAN_REVIEW" as const };
  } catch (error) {
    const safeError = error instanceof Error && /structured validation|invalid|outside|cannot both|suggested accounts/i.test(error.message)
      ? error.message
      : "AI review failed. Please retry.";
    await prisma.aIReviewRecord.update({ where: { id: review.id }, data: { status: "FAILED", provider: provider.provider, model: provider.model, contextVersion: ACCOUNTING_REVIEW_VERSION } });
    await prisma.aIReviewAudit.create({
      data: { candidateId, action: "FAILED", provider: provider.provider, model: provider.model, contextVersion: ACCOUNTING_REVIEW_VERSION, userId },
    });
    return { ok: false as const, error: safeError };
  }
}

export async function getAccountingAIReview(
  organizationId: string,
  companyId: string,
  documentId: string,
  candidateId: string
) {
  const candidate = await loadScopedCandidate(organizationId, companyId, documentId, candidateId);
  if (!candidate) return null;
  const review = await prisma.aIReviewRecord.findUnique({
    where: { candidateId },
    include: {
      suggestions: { orderBy: { createdAt: "desc" }, take: 5, include: { suggestedAccount: { select: { id: true, code: true, name: true, type: true } } } },
      reviewedBy: { select: { id: true, name: true } },
      humanAccount: { select: { id: true, code: true, name: true, type: true } },
      audits: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, provider: true, model: true, contextVersion: true, confidence: true, createdAt: true, user: { select: { id: true, name: true } } } },
    },
  });
  return review;
}

async function recordHumanDecision(
  organizationId: string,
  companyId: string,
  documentId: string,
  candidateId: string,
  userId: string,
  decision: AIReviewDecision,
  values: { accountId?: string | null; debit?: string | null; credit?: string | null; amount?: string | null; notes?: string | null }
) {
  const candidate = await loadScopedCandidate(organizationId, companyId, documentId, candidateId);
  if (!candidate) return { ok: false as const, error: "Transaction candidate not found." };
  const latestSuggestion = await prisma.aIReviewSuggestion.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
  if (!latestSuggestion) return { ok: false as const, error: "No AI suggestion is available for review." };

  if (values.debit) moneySchema.parse(values.debit);
  if (values.credit) moneySchema.parse(values.credit);
  if (values.amount) moneySchema.parse(values.amount);
  const directionError = validateDirection({ debit: values.debit || undefined, credit: values.credit || undefined });
  if (directionError) return { ok: false as const, error: directionError };

  if (values.accountId) {
    const account = await getOwnedAccount(organizationId, companyId, values.accountId);
    if (!account || !account.isActive) return { ok: false as const, error: "Selected account is not available for this company." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.aIReviewRecord.update({
      where: { candidateId },
      data: {
        status: "REVIEWED",
        decision,
        reviewedById: userId,
        reviewedAt: new Date(),
        humanAccountId: values.accountId || null,
        humanDebit: values.debit ? new Prisma.Decimal(values.debit) : null,
        humanCredit: values.credit ? new Prisma.Decimal(values.credit) : null,
        humanAmount: values.amount ? new Prisma.Decimal(values.amount) : null,
        humanNotes: values.notes?.trim() || null,
      },
    });
    await tx.aiReviewAudit.create({
      data: {
        candidateId,
        suggestionId: latestSuggestion.id,
        action: decision === "ACCEPTED" ? "ACCEPTED" : decision === "REJECTED" ? "REJECTED" : "EDITED",
        provider: latestSuggestion.provider,
        model: latestSuggestion.model,
        contextVersion: latestSuggestion.contextVersion,
        confidence: latestSuggestion.confidence,
        userId,
      },
    });
  });

  return { ok: true as const };
}

export async function acceptAccountingAISuggestion(organizationId: string, companyId: string, documentId: string, candidateId: string, userId: string) {
  const latest = await prisma.aIReviewSuggestion.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
  if (!latest) return { ok: false as const, error: "No AI suggestion is available for review." };
  return recordHumanDecision(organizationId, companyId, documentId, candidateId, userId, "ACCEPTED", {
    accountId: latest.suggestedAccountId,
    debit: latest.suggestedDebit?.toString(),
    credit: latest.suggestedCredit?.toString(),
    amount: latest.suggestedAmount?.toString(),
  });
}

export async function rejectAccountingAISuggestion(organizationId: string, companyId: string, documentId: string, candidateId: string, userId: string, notes?: string | null) {
  return recordHumanDecision(organizationId, companyId, documentId, candidateId, userId, "REJECTED", { notes });
}

export async function editAccountingAISuggestion(organizationId: string, companyId: string, documentId: string, candidateId: string, userId: string, values: { accountId?: string | null; debit?: string | null; credit?: string | null; amount?: string | null; notes?: string | null }) {
  return recordHumanDecision(organizationId, companyId, documentId, candidateId, userId, "EDITED", values);
}
