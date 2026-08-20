import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { extractOwnedDocumentContent } from "@/documents/processing";
import { classifyOwnedAccountingDocument, classificationNeedsReview } from "@/documents/classification";
import { listOwnedCandidates } from "@/documents/normalization";
import { generateAccountingAISuggestion, confirmAccountingAISuggestion } from "@/ai/review";
import { createDraftJournalEntryFromSuggestion } from "@/accounting/journal-entry-drafts";
import { getDocumentStorage } from "@/storage/document-storage";
import type { DocumentAIUnderstandingResult } from "@/documents/ai-extraction";

/**
 * Smart Import — bridge from "just uploaded a file" to a reviewable set of
 * proposed Draft Journal Entries, for the Journal Entries > New screen.
 *
 * This does not reimplement anything: it is a thin orchestration over the
 * exact same steps a person previously had to click through one at a time
 * on the Documents page and the AI Review queue (extract content -> AI
 * extraction/normalization -> AI account suggestion). Nothing here bypasses
 * any of that pipeline's validation.
 *
 * Phase 5A-9c: Smart Import now STAGES ONLY — it never creates a Draft
 * Journal Entry by itself. Once the document is extracted/normalized and
 * (optionally) the AI has proposed an account per row, control hands off to
 * the Reconcile screen (`getSmartImportReviewData` /
 * `confirmSmartImportCandidates`) where a human reviews every proposed
 * account and explicitly confirms before anything is created — matching
 * normal bookkeeping practice: one statement/document in -> one Draft
 * Journal Entry per transaction out (never one merged entry), and nothing
 * posts until a human says so.
 */

export type SmartImportStagedCandidate = {
  candidateId: string;
  description: string | null;
  date: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  currency: string | null;
  confidence: string;
  warnings: string[];
  possibleDuplicate: boolean;
  suggestion: {
    accountId: string | null;
    accountCode: string | null;
    accountName: string | null;
    confidence: string;
    explanation: string;
    warnings: string[];
  } | null;
  suggestionError: string | null;
};

export type SmartImportOutcome = {
  ok: true;
  documentId: string;
  documentName: string;
  candidateCount: number;
  staged: SmartImportStagedCandidate[];
  /** Only populated when candidateCount is 0 — the actual reason nothing was
   *  found (extraction warnings, AI reasoning/findings), so "no transactions
   *  found" isn't a dead end the user has to guess about. */
  diagnostics?: {
    extractionWarnings: string[];
    aiUnderstandingError: string | null;
    aiReasoning: string | null;
    aiFindings: { code: string; message: string; severity: string }[];
  };
} | {
  ok: false;
  error: string;
  /** Present only when the failure is "classification needs review" — lets
   *  the caller offer manual classification right there instead of sending
   *  the user away to the Documents page. */
  documentId?: string;
  needsClassification?: boolean;
};

export async function runSmartImport(
  organizationId: string,
  companyId: string,
  userId: string,
  documentId: string,
  guidance?: string,
  proposeAccounts = true
): Promise<SmartImportOutcome> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId: company.id },
    select: { id: true, originalFileName: true },
  });
  if (!document) return { ok: false, error: "Document not found." };

  // BUG FIX (Phase 5A-9b): extraction requires the document to already be
  // CLASSIFIED/MANUALLY_REVIEWED (see src/documents/processing.ts), but
  // nothing on the Smart Import path ever ran classification — it was only
  // wired up on the separate Documents page. That made every Smart Import
  // fail with "Document classification must be completed before extraction."
  // Smart Import now runs classification itself, matching what the Documents
  // page flow does before it calls extraction.
  const classification = await classifyOwnedAccountingDocument(organizationId, company.id, documentId, userId);
  if (!classification.ok) {
    return { ok: false, error: classification.error };
  }
  if (classificationNeedsReview(classification.classification.status, classification.classification.confidence, classification.classification.documentType)) {
    return {
      ok: false,
      error:
        "We couldn't confidently tell what kind of document this is. Pick the document type below to continue.",
      documentId,
      needsClassification: true,
    };
  }

  // Extraction already chains into AI normalization on success (see
  // src/documents/processing.ts) — this one call runs the whole "read the
  // document and find transactions" half of the pipeline.
  const extraction = await extractOwnedDocumentContent(organizationId, company.id, documentId, userId, false, guidance);
  if (extraction.error && extraction.status === "FAILED") {
    return { ok: false, error: extraction.error };
  }

  const candidates = await listOwnedCandidates(organizationId, company.id, documentId);
  if (!candidates.length) {
    const diagnostics = await buildEmptyResultDiagnostics(documentId);
    return { ok: true, documentId, documentName: document.originalFileName, candidateCount: 0, staged: [], diagnostics };
  }

  const staged: SmartImportStagedCandidate[] = [];

  for (const candidate of candidates) {
    const base = {
      candidateId: candidate.id,
      description: candidate.description,
      date: candidate.date,
      amount: candidate.amount ?? candidate.debit ?? candidate.credit,
      debit: candidate.debit,
      credit: candidate.credit,
      currency: candidate.currency,
      confidence: candidate.confidence,
      warnings: candidate.warnings,
      possibleDuplicate: candidate.possibleDuplicate,
    };

    // A likely duplicate always needs a human look — proposing (and
    // possibly double-posting) an account for it would defeat the point of
    // duplicate detection, so it's staged with no suggestion generated.
    if (candidate.possibleDuplicate || !proposeAccounts) {
      staged.push({ ...base, suggestion: null, suggestionError: null });
      continue;
    }

    const suggestion = await generateAccountingAISuggestion(organizationId, company.id, documentId, candidate.id, userId);
    if (!suggestion.ok) {
      staged.push({ ...base, suggestion: null, suggestionError: suggestion.error });
      continue;
    }

    const suggestionRow = await prisma.aIReviewSuggestion.findUnique({
      where: { id: suggestion.suggestionId },
      include: { suggestedAccount: { select: { id: true, code: true, name: true } } },
    });

    staged.push({
      ...base,
      suggestion: suggestionRow
        ? {
            accountId: suggestionRow.suggestedAccount?.id ?? null,
            accountCode: suggestionRow.suggestedAccount?.code ?? null,
            accountName: suggestionRow.suggestedAccount?.name ?? null,
            confidence: suggestionRow.confidence,
            explanation: suggestionRow.explanation,
            warnings: Array.isArray(suggestionRow.warnings) ? suggestionRow.warnings.map(String) : [],
          }
        : null,
      suggestionError: null,
    });
  }

  return {
    ok: true,
    documentId,
    documentName: document.originalFileName,
    candidateCount: candidates.length,
    staged,
  };
}

/**
 * When Smart Import stages zero candidates, "No transactions were found in
 * this document." alone gives the user nothing to act on — was it a scanned
 * PDF with no OCR? A statement-type document with no dated line items? The
 * AI legitimately finding nothing? This pulls the real extraction warnings
 * and (if AI document-understanding ran) its stated reasoning/findings so
 * the empty result is explainable instead of a dead end.
 */
async function buildEmptyResultDiagnostics(documentId: string) {
  const result = await prisma.documentProcessingResult.findUnique({
    where: { documentId },
    select: { warnings: true, aiUnderstandingError: true, aiUnderstandingReference: true },
  });
  const extractionWarnings = Array.isArray(result?.warnings) ? result.warnings.map(String) : [];
  let aiReasoning: string | null = null;
  let aiFindings: { code: string; message: string; severity: string }[] = [];
  if (result?.aiUnderstandingReference) {
    try {
      const raw = await getDocumentStorage().read(result.aiUnderstandingReference);
      const understanding = JSON.parse(raw.toString("utf8")) as DocumentAIUnderstandingResult;
      aiReasoning = understanding.reasoning || null;
      aiFindings = understanding.findings ?? [];
    } catch {
      // Best-effort only — an unreadable diagnostics blob shouldn't block
      // showing the (already successful) empty-result outcome.
    }
  }
  return { extractionWarnings, aiUnderstandingError: result?.aiUnderstandingError ?? null, aiReasoning, aiFindings };
}

/**
 * Data for the Reconcile screen a Smart Import run hands off to: every
 * staged candidate (re-read fresh from the DB, not trusted from the
 * client), its latest AI suggestion if any, and the company's active
 * Chart of Accounts for the account-override dropdown.
 */
export async function getSmartImportReviewData(organizationId: string, companyId: string, documentId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId: company.id },
    select: { id: true, originalFileName: true },
  });
  if (!document) return null;

  const [candidates, accounts] = await Promise.all([
    listOwnedCandidates(organizationId, company.id, documentId),
    prisma.account.findMany({
      where: { companyId: company.id, company: { organizationId }, isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const suggestions = await prisma.aIReviewSuggestion.findMany({
    where: { candidateId: { in: candidates.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    include: { suggestedAccount: { select: { id: true, code: true, name: true } } },
  });
  const latestByCandidate = new Map<string, (typeof suggestions)[number]>();
  for (const suggestion of suggestions) {
    if (!latestByCandidate.has(suggestion.candidateId)) latestByCandidate.set(suggestion.candidateId, suggestion);
  }

  const existingDrafts = await prisma.journalEntry.findMany({
    where: { companyId: company.id, transactionCandidateId: { in: candidates.map((c) => c.id) } },
    select: { transactionCandidateId: true, id: true },
  });
  const draftByCandidate = new Map(existingDrafts.map((d) => [d.transactionCandidateId as string, d.id]));

  return {
    documentId: document.id,
    documentName: document.originalFileName,
    accounts,
    rows: candidates.map((candidate) => {
      const suggestion = latestByCandidate.get(candidate.id);
      return {
        candidateId: candidate.id,
        description: candidate.description,
        date: candidate.date,
        amount: candidate.amount ?? candidate.debit ?? candidate.credit,
        debit: candidate.debit,
        credit: candidate.credit,
        currency: candidate.currency,
        confidence: candidate.confidence,
        warnings: candidate.warnings,
        possibleDuplicate: candidate.possibleDuplicate,
        alreadyCreatedJournalEntryId: draftByCandidate.get(candidate.id) ?? null,
        suggestion: suggestion
          ? {
              accountId: suggestion.suggestedAccount?.id ?? suggestion.suggestedAccountId ?? null,
              accountCode: suggestion.suggestedAccount?.code ?? null,
              accountName: suggestion.suggestedAccount?.name ?? null,
              confidence: suggestion.confidence,
              explanation: suggestion.explanation,
              warnings: Array.isArray(suggestion.warnings) ? suggestion.warnings.map(String) : [],
            }
          : null,
        // No stored suggestion usually means either it was never requested
        // (possible duplicate, or "propose accounts" was off) or generation
        // failed (AIReviewRecord.status === "FAILED"). Only surface an error
        // string in the latter case so the Reconcile screen can tell the
        // human "AI couldn't do this one" apart from "wasn't asked to".
        suggestionError: !suggestion && candidate.aiReviewStatus === "FAILED"
          ? "AI could not propose an account for this transaction. Pick one manually."
          : null,
      };
    }),
  };
}

export type SmartImportConfirmation = {
  candidateId: string;
  /** Human-picked account, if different from (or absent from) the AI's proposal. */
  accountId?: string;
};

export type SmartImportCreatedEntry = {
  candidateId: string;
  journalEntryId: string;
  entryNumber: string;
  description: string | null;
  entryDate: string;
  amount: string;
};

export type SmartImportAttentionItem = {
  candidateId: string;
  description: string | null;
  reason: string;
};

/**
 * The Reconcile-screen confirm action: for each row the human chose to
 * include, accept its (possibly overridden) account and create the Draft
 * Journal Entry. This is the only place in the Smart Import flow that
 * actually creates anything — nothing posts until this is called.
 */
export async function confirmSmartImportCandidates(
  organizationId: string,
  companyId: string,
  userId: string,
  documentId: string,
  confirmations: SmartImportConfirmation[]
): Promise<{ ok: true; created: SmartImportCreatedEntry[]; needsAttention: SmartImportAttentionItem[] } | { ok: false; error: string }> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const created: SmartImportCreatedEntry[] = [];
  const needsAttention: SmartImportAttentionItem[] = [];

  for (const confirmation of confirmations) {
    const candidate = await prisma.normalizedTransactionCandidate.findFirst({
      where: { id: confirmation.candidateId, documentId, organizationId, companyId: company.id },
      select: { id: true, description: true },
    });
    if (!candidate) {
      needsAttention.push({ candidateId: confirmation.candidateId, description: null, reason: "Transaction candidate not found." });
      continue;
    }

    const confirmed = await confirmAccountingAISuggestion(organizationId, company.id, documentId, candidate.id, userId, {
      accountId: confirmation.accountId,
    });
    if (!confirmed.ok) {
      needsAttention.push({ candidateId: candidate.id, description: candidate.description, reason: confirmed.error });
      continue;
    }

    const draft = await createDraftJournalEntryFromSuggestion(organizationId, userId, {
      companyId: company.id,
      documentId,
      candidateId: candidate.id,
    });

    if (!draft.ok) {
      needsAttention.push({
        candidateId: candidate.id,
        description: candidate.description,
        reason:
          draft.code === "DATE_CONFIRMATION_REQUIRED"
            ? "Transaction date is missing or uncertain — confirm the date to create this entry."
            : draft.code === "CURRENCY_REVIEW_REQUIRED"
            ? "Transaction currency differs from the company's reporting currency — needs manual review."
            : draft.code === "DUPLICATE_DRAFT"
            ? "A draft journal entry already exists for this transaction."
            : draft.error,
      });
      continue;
    }

    const line = draft.entry.lines[0];
    created.push({
      candidateId: candidate.id,
      journalEntryId: draft.entry.id,
      entryNumber: draft.entry.entryNumber,
      description: draft.entry.description,
      entryDate: draft.entry.entryDate.toISOString(),
      amount: (line?.debit && line.debit.toString() !== "0" ? line.debit : line?.credit)?.toString() ?? "0",
    });
  }

  return { ok: true, created, needsAttention };
}
