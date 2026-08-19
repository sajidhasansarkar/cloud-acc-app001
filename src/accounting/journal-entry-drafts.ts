import { Prisma } from "@prisma/client";
import type { JournalEntry, JournalEntryLine } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getOwnedCompany,
  getOwnedAccount,
  getOwnedTransactionCandidate,
  getOwnedFiscalYearForDate,
  getOwnedAccountingPeriodForDate,
} from "./access";
import { createJournalEntry } from "./journal-entries";
import { getOwnedTaxCode } from "@/tax/access";

/**
 * Phase 4B-6 — Accepted AI Suggestion -> Draft Journal Entry.
 *
 * Controlled workflow: Normalized Transaction -> AI Suggestion -> Human
 * Review -> Accepted Suggestion -> Draft Journal Entry -> existing Journal
 * Entry validation -> human can edit -> future Posting Phase.
 *
 * This module intentionally does NOT: post journal entries, invent a
 * balancing account/line, convert currency, guess a missing/low-confidence
 * transaction date, or duplicate the Journal Entry / AI review systems
 * already implemented in journal-entries.ts and src/ai/review.ts — it only
 * orchestrates them behind the ownership checks required by spec section
 * 16.
 */

export type CreateDraftFromSuggestionInput = {
  companyId: string;
  documentId: string;
  candidateId: string;
  // Required only when the normalized transaction date is missing or
  // LOW confidence (spec section 17). The workflow never silently guesses
  // a date — the human must explicitly confirm one first.
  confirmedDate?: Date | string;
};

export type CreateDraftFromSuggestionErrorCode =
  | "SUGGESTION_NOT_ACCEPTED"
  | "DUPLICATE_DRAFT"
  | "DATE_CONFIRMATION_REQUIRED"
  | "CURRENCY_REVIEW_REQUIRED"
  | "INVALID_ACCOUNT"
  | "INVALID_AMOUNT"
  | "FISCAL_YEAR_NOT_FOUND"
  | "ACCOUNTING_PERIOD_NOT_FOUND"
  | "NOT_FOUND"
  | "VALIDATION_ERROR";

export type CreateDraftFromSuggestionResult =
  | { ok: true; entry: JournalEntry & { lines: JournalEntryLine[] } }
  | {
      ok: false;
      error: string;
      code: CreateDraftFromSuggestionErrorCode;
      existingJournalEntryId?: string;
    };

/**
 * Generates a company-unique entry number for an AI-originated draft
 * without a complicated automatic numbering system (spec section 10 of the
 * original Journal Entry foundation still applies — this just needs *a*
 * unique, traceable number since this workflow has no manual entry form for
 * the human to type one into). Derived from the candidate id so the number
 * itself hints at its source; collisions are astronomically unlikely given
 * cuid entropy, but are still handled rather than assumed away.
 */
async function generateEntryNumber(companyId: string, candidateId: string): Promise<string> {
  const base = `AI-${candidateId.slice(-8).toUpperCase()}`;
  const existing = await prisma.journalEntry.findFirst({
    where: { companyId, entryNumber: base },
    select: { id: true },
  });
  if (!existing) return base;
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Creates a DRAFT Journal Entry from a candidate's human-accepted AI
 * suggestion. Every id in `input` is re-derived through the ownership
 * chain (Authenticated User -> Organization -> Company -> Document ->
 * Transaction Candidate -> AI Suggestion) rather than trusted from the
 * browser (spec section 16).
 */
export async function createDraftJournalEntryFromSuggestion(
  organizationId: string,
  userId: string,
  input: CreateDraftFromSuggestionInput
): Promise<CreateDraftFromSuggestionResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) return { ok: false, error: "Company not found.", code: "NOT_FOUND" };

  const candidate = await getOwnedTransactionCandidate(
    organizationId,
    company.id,
    input.documentId,
    input.candidateId
  );
  if (!candidate) return { ok: false, error: "Transaction candidate not found.", code: "NOT_FOUND" };

  // Spec section 1: only a human-accepted suggestion may produce a Journal
  // Entry — never automatically from a raw AI suggestion.
  const review = candidate.aiReview;
  if (!review || review.decision !== "ACCEPTED") {
    return {
      ok: false,
      error: "This transaction does not have a human-accepted AI suggestion.",
      code: "SUGGESTION_NOT_ACCEPTED",
    };
  }

  const latestSuggestion = await prisma.aIReviewSuggestion.findFirst({
    where: { candidateId: candidate.id },
    orderBy: { createdAt: "desc" },
  });
  if (!latestSuggestion) {
    return { ok: false, error: "No AI suggestion is available for this transaction.", code: "NOT_FOUND" };
  }

  // Spec section 10: duplicate-draft protection, checked before any other
  // write so a stale/double-clicked UI can never create a second draft for
  // the same candidate.
  const existingDraft = await prisma.journalEntry.findFirst({
    where: { companyId: company.id, transactionCandidateId: candidate.id },
    select: { id: true },
  });
  if (existingDraft) {
    return {
      ok: false,
      error: "Draft Journal Entry already exists.",
      code: "DUPLICATE_DRAFT",
      existingJournalEntryId: existingDraft.id,
    };
  }

  // Spec section 5/16: the account the human accepted is re-verified
  // against this company right now — never trusted from the stored review
  // record (or the browser) alone.
  if (!review.humanAccountId) {
    return { ok: false, error: "The accepted suggestion has no account selected.", code: "INVALID_ACCOUNT" };
  }
  const account = await getOwnedAccount(organizationId, company.id, review.humanAccountId);
  if (!account) {
    return { ok: false, error: "The accepted account does not belong to this company.", code: "INVALID_ACCOUNT" };
  }
  if (!account.isActive) {
    return { ok: false, error: "The accepted account is inactive.", code: "INVALID_ACCOUNT" };
  }

  const debit = review.humanDebit ?? new Prisma.Decimal(0);
  const credit = review.humanCredit ?? new Prisma.Decimal(0);
  if (debit.lte(0) && credit.lte(0)) {
    return {
      ok: false,
      error: "The accepted suggestion has no debit or credit amount.",
      code: "INVALID_AMOUNT",
    };
  }

  // Spec section 17: never silently guess the transaction date.
  let entryDate: Date;
  if (candidate.date && candidate.dateConfidence !== "LOW") {
    entryDate = candidate.date;
  } else if (input.confirmedDate) {
    const parsed = new Date(input.confirmedDate);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Enter a valid transaction date.", code: "VALIDATION_ERROR" };
    }
    entryDate = parsed;
  } else {
    return {
      ok: false,
      error: "This transaction date is missing or low-confidence and must be confirmed before creating a Draft.",
      code: "DATE_CONFIRMATION_REQUIRED",
    };
  }

  // Spec section 18: never auto-convert currency — flag for human handling
  // instead of creating anything.
  if (candidate.currency && candidate.currency.trim().toUpperCase() !== company.currency.trim().toUpperCase()) {
    return { ok: false, error: "CURRENCY_REVIEW_REQUIRED", code: "CURRENCY_REVIEW_REQUIRED" };
  }

  // Spec section 6/7: fiscal year + accounting period must both actually
  // contain the transaction date — never invented/defaulted.
  const fiscalYear = await getOwnedFiscalYearForDate(organizationId, company.id, entryDate);
  if (!fiscalYear) {
    return {
      ok: false,
      error: "No valid fiscal year is available for this transaction date.",
      code: "FISCAL_YEAR_NOT_FOUND",
    };
  }

  const accountingPeriod = await getOwnedAccountingPeriodForDate(organizationId, company.id, entryDate);
  if (!accountingPeriod || accountingPeriod.fiscalYearId !== fiscalYear.id) {
    return {
      ok: false,
      error: "No valid accounting period is available for this transaction date.",
      code: "ACCOUNTING_PERIOD_NOT_FOUND",
    };
  }

  const entryNumber = await generateEntryNumber(company.id, candidate.id);

  // Spec section 4/9: the existing Journal Entry model + Decimal-safe line
  // creation handle the actual write (single database call, nested lines —
  // no orphan lines possible). Spec section 8: only the single
  // human-accepted line is created here — no balancing account is
  // invented; the human adds any further line via the existing editor.
  const result = await createJournalEntry(organizationId, userId, {
    companyId: company.id,
    fiscalYearId: fiscalYear.id,
    accountingPeriodId: accountingPeriod.id,
    entryNumber,
    entryDate,
    reference: candidate.reference ?? undefined,
    description: candidate.description ?? "AI-suggested transaction",
    label: "AI Suggestion",
    sourceType: "AI",
    sourceDocumentId: candidate.documentId,
    transactionCandidateId: candidate.id,
    aiSuggestionId: latestSuggestion.id,
    lines: [
      {
        accountId: account.id,
        description: candidate.description ?? undefined,
        reference: candidate.reference ?? undefined,
        debit,
        credit,
      },
    ],
  });

  if (!result.ok) {
    return { ok: false, error: result.error, code: "VALIDATION_ERROR" };
  }

  // Spec section 20: audit the Source Transaction -> AI Suggestion ->
  // Human Approval -> Draft Journal Entry chain via the existing AI review
  // audit trail (no new/duplicate audit system). Best-effort: the Draft
  // Journal Entry itself is already safely created and is the source of
  // truth, so a failure recording this metadata does not roll it back.
  try {
    await prisma.$transaction(async (tx) => {
      const currentReview = await tx.aIReviewRecord.findUnique({
        where: { candidateId: candidate.id },
        select: { humanReviewStatus: true },
      });

      if (currentReview) {
        await tx.aIReviewRecord.update({
          where: { candidateId: candidate.id },
          data: { humanReviewStatus: "NEEDS_CORRECTION" },
        });

        await tx.aIReviewAudit.create({
          data: {
            candidateId: candidate.id,
            suggestionId: latestSuggestion.id,
            action: "DRAFT_CREATED",
            provider: latestSuggestion.provider,
            model: latestSuggestion.model,
            contextVersion: latestSuggestion.contextVersion,
            confidence: latestSuggestion.confidence,
            userId,
            journalEntryId: result.entry.id,
            previousHumanReviewStatus: currentReview.humanReviewStatus,
            newHumanReviewStatus: "NEEDS_CORRECTION",
            relevantCorrection: "Draft created; journal requires human reconciliation before readiness.",
          },
        });
      }
    });
  } catch {
    // Non-fatal — see comment above.
  }

  return { ok: true, entry: result.entry };
}

/**
 * Phase 5A-6 — normalized transaction + approved account mapping -> editable
 * DRAFT Journal Entry. This is intentionally separate from the older
 * accepted-AI-suggestion bridge so account mapping is the source of truth.
 */
export type CreateDraftFromTransactionErrorCode =
  | "NOT_FOUND"
  | "MAPPING_NOT_READY"
  | "DUPLICATE_DRAFT"
  | "DATE_CONFIRMATION_REQUIRED"
  | "CURRENCY_REVIEW_REQUIRED"
  | "INVALID_AMOUNT"
  | "INVALID_ACCOUNT"
  | "FISCAL_YEAR_NOT_FOUND"
  | "ACCOUNTING_PERIOD_NOT_FOUND"
  | "VALIDATION_ERROR";

export type CreateDraftFromTransactionResult =
  | { ok: true; entry: JournalEntry & { lines: JournalEntryLine[] } }
  | { ok: false; error: string; code: CreateDraftFromTransactionErrorCode; existingJournalEntryId?: string };

async function generateTransactionEntryNumber(companyId: string, transactionId: string) {
  const base = `AI-TX-${transactionId.slice(-8).toUpperCase()}`;
  const existing = await prisma.journalEntry.findFirst({ where: { companyId, entryNumber: base }, select: { id: true } });
  return existing ? `${base}-${Date.now().toString(36).toUpperCase()}` : base;
}

function positiveAmount(value: Prisma.Decimal | null | undefined) {
  return value && value.gt(0) ? value : null;
}

export async function createDraftJournalEntryFromTransaction(
  organizationId: string,
  userId: string,
  transactionId: string,
  confirmedDate?: Date | string
): Promise<CreateDraftFromTransactionResult> {
  const candidate = await prisma.normalizedTransactionCandidate.findFirst({
    where: {
      id: transactionId,
      organizationId,
      company: { organizationId },
      document: { organizationId },
    },
    include: {
      company: true,
      accountMapping: true,
      document: { select: { id: true, originalFileName: true, companyId: true } },
    },
  });
  if (!candidate) return { ok: false, error: "Transaction not found.", code: "NOT_FOUND" };

  const mapping = candidate.accountMapping;
  if (!mapping || mapping.status !== "READY_FOR_JOURNAL") {
    return { ok: false, error: "The account mapping must be approved and ready for journal generation.", code: "MAPPING_NOT_READY" };
  }

  const existingDraft = await prisma.journalEntry.findFirst({
    where: { companyId: candidate.companyId, transactionCandidateId: candidate.id, status: "DRAFT" },
    select: { id: true },
  });
  if (existingDraft) {
    return { ok: false, error: "A Draft Journal Entry already exists for this transaction.", code: "DUPLICATE_DRAFT", existingJournalEntryId: existingDraft.id };
  }

  let entryDate: Date;
  if (candidate.date && candidate.dateConfidence !== "LOW") {
    entryDate = candidate.date;
  } else if (confirmedDate) {
    entryDate = new Date(confirmedDate);
    if (Number.isNaN(entryDate.getTime())) return { ok: false, error: "Enter a valid transaction date.", code: "VALIDATION_ERROR" };
  } else {
    return { ok: false, error: "This transaction date is missing or low-confidence and must be confirmed before creating the draft.", code: "DATE_CONFIRMATION_REQUIRED" };
  }

  if (candidate.currency && candidate.currency.toUpperCase() !== candidate.company.currency.toUpperCase()) {
    return { ok: false, error: `Transaction currency ${candidate.currency} does not match company currency ${candidate.company.currency}. Review before generating the draft.`, code: "CURRENCY_REVIEW_REQUIRED" };
  }

  const debitAmount = positiveAmount(candidate.debit);
  const creditAmount = positiveAmount(candidate.credit);
  const amount = positiveAmount(candidate.amount) ?? debitAmount ?? creditAmount;
  if (!amount) return { ok: false, error: "The normalized transaction has no positive amount.", code: "INVALID_AMOUNT" };

  const debitAccountId = mapping.selectedDebitAccountId ?? mapping.aiDebitAccountId;
  const creditAccountId = mapping.selectedCreditAccountId ?? mapping.aiCreditAccountId;
  if (!debitAccountId || !creditAccountId) return { ok: false, error: "Both debit and credit accounts are required for journal generation.", code: "INVALID_ACCOUNT" };

  const [debitAccount, creditAccount] = await Promise.all([
    getOwnedAccount(organizationId, candidate.companyId, debitAccountId),
    getOwnedAccount(organizationId, candidate.companyId, creditAccountId),
  ]);
  if (!debitAccount?.isActive || !creditAccount?.isActive) return { ok: false, error: "The mapped account is inactive or does not belong to this company.", code: "INVALID_ACCOUNT" };

  let mappedTaxCodeId: string | undefined;
  let mappedTaxSide: "DEBIT" | "CREDIT" | undefined;
  if (mapping.taxContext && typeof mapping.taxContext === "object" && !Array.isArray(mapping.taxContext)) {
    const context = mapping.taxContext as Record<string, unknown>;
    if (typeof context.taxCodeId === "string") mappedTaxCodeId = context.taxCodeId;
    if (context.side === "DEBIT" || context.side === "CREDIT") mappedTaxSide = context.side;
  }
  if (mappedTaxCodeId) {
    const taxCode = await getOwnedTaxCode(organizationId, candidate.companyId, mappedTaxCodeId);
    if (!taxCode || !taxCode.isActive) return { ok: false, error: "The mapped tax code is inactive or does not belong to this company.", code: "INVALID_ACCOUNT" };
  }

  const fiscalYear = await getOwnedFiscalYearForDate(organizationId, candidate.companyId, entryDate);
  if (!fiscalYear) return { ok: false, error: "No valid fiscal year is available for this transaction date.", code: "FISCAL_YEAR_NOT_FOUND" };
  const accountingPeriod = await getOwnedAccountingPeriodForDate(organizationId, candidate.companyId, entryDate);
  if (!accountingPeriod || accountingPeriod.fiscalYearId !== fiscalYear.id) return { ok: false, error: "No valid accounting period is available for this transaction date.", code: "ACCOUNTING_PERIOD_NOT_FOUND" };

  // The normalized transaction determines the side of the transaction; the
  // mapping supplies the accounts. The service never invents a balancing
  // account and never converts currency.
  const debit = amount;
  const credit = amount;

  const entryNumber = await generateTransactionEntryNumber(candidate.companyId, candidate.id);
  const result = await createJournalEntry(organizationId, userId, {
    companyId: candidate.companyId,
    fiscalYearId: fiscalYear.id,
    accountingPeriodId: accountingPeriod.id,
    entryNumber,
    entryDate,
    reference: candidate.reference ?? undefined,
    description: candidate.description ?? "AI-normalized transaction",
    sourceType: "AI",
    sourceDocumentId: candidate.documentId,
    transactionCandidateId: candidate.id,
    lines: [
      {
        accountId: debitAccount.id,
        taxCodeId: mappedTaxCodeId && mappedTaxSide !== "CREDIT" ? mappedTaxCodeId : undefined,
        description: candidate.description ?? undefined,
        reference: candidate.reference ?? undefined,
        debit,
        credit: new Prisma.Decimal(0),
        accountSource: mapping.selectedDebitAccountId ? "USER" : "AI",
        descriptionSource: "AI",
        debitSource: "AI",
        creditSource: "AI",
        referenceSource: "AI",
        taxCodeSource: "AI",
      },
      {
        accountId: creditAccount.id,
        taxCodeId: mappedTaxCodeId && mappedTaxSide === "CREDIT" ? mappedTaxCodeId : undefined,
        description: candidate.description ?? undefined,
        reference: candidate.reference ?? undefined,
        debit: new Prisma.Decimal(0),
        credit,
        accountSource: mapping.selectedCreditAccountId ? "USER" : "AI",
        descriptionSource: "AI",
        debitSource: "AI",
        creditSource: "AI",
        referenceSource: "AI",
        taxCodeSource: "AI",
      },
    ],
  });
  if (!result.ok) return { ok: false, error: result.error, code: "VALIDATION_ERROR" };

  try {
    await prisma.documentAuditEvent.create({
      data: {
        organizationId,
        companyId: candidate.companyId,
        documentId: candidate.documentId,
        userId,
        action: "DRAFT_JOURNAL_GENERATED_FROM_TRANSACTION",
        details: { transactionId: candidate.id, journalEntryId: result.entry.id, debitAccountId: debitAccount.id, creditAccountId: creditAccount.id },
      },
    });
    const review = await prisma.aIReviewRecord.findUnique({ where: { candidateId: candidate.id }, select: { id: true } });
    if (review) {
      const suggestion = await prisma.aIReviewSuggestion.findFirst({ where: { candidateId: candidate.id }, orderBy: { createdAt: "desc" }, select: { id: true, provider: true, model: true, contextVersion: true, confidence: true } });
      await prisma.aIReviewAudit.create({
        data: {
          candidateId: candidate.id,
          suggestionId: suggestion?.id,
          action: "DRAFT_CREATED",
          provider: suggestion?.provider,
          model: suggestion?.model,
          contextVersion: suggestion?.contextVersion,
          confidence: suggestion?.confidence,
          userId,
          journalEntryId: result.entry.id,
        },
      });
    }
  } catch (error) {
    console.error("Draft generation audit failed", error);
  }

  return result;
}

export async function regenerateDraftJournalEntryFromTransaction(
  organizationId: string,
  userId: string,
  journalEntryId: string,
  force = false
): Promise<CreateDraftFromTransactionResult> {
  const draft = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, status: "DRAFT", company: { organizationId } },
    include: { lines: true },
  });
  if (!draft) return { ok: false, error: "Draft Journal Entry not found.", code: "NOT_FOUND" };
  if (!draft.transactionCandidateId) return { ok: false, error: "This draft has no source transaction and cannot be regenerated from a transaction.", code: "VALIDATION_ERROR" };
  if (draft.version > 1 && !force) return { ok: false, error: "This draft has been manually modified. Confirm regeneration to discard those changes.", code: "VALIDATION_ERROR" };

  const transactionId = draft.transactionCandidateId;
  await prisma.journalEntry.delete({ where: { id: draft.id } });
  const result = await createDraftJournalEntryFromTransaction(organizationId, userId, transactionId);
  if (result.ok) {
    try {
      await prisma.documentAuditEvent.create({
        data: { organizationId, companyId: draft.companyId, documentId: draft.sourceDocumentId, userId, action: "DRAFT_JOURNAL_REGENERATED", details: { oldJournalEntryId: draft.id, newJournalEntryId: result.entry.id, transactionId } },
      });
    } catch (error) {
      console.error("Draft regeneration audit failed", error);
    }
  }
  return result;
}
