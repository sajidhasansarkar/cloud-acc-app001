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
    await prisma.aIReviewAudit.create({
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
      },
    });
  } catch {
    // Non-fatal — see comment above.
  }

  return { ok: true, entry: result.entry };
}
