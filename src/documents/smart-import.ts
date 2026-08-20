import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { extractOwnedDocumentContent } from "@/documents/processing";
import { listOwnedCandidates } from "@/documents/normalization";
import { generateAccountingAISuggestion, acceptAccountingAISuggestion } from "@/ai/review";
import { createDraftJournalEntryFromSuggestion } from "@/accounting/journal-entry-drafts";

/**
 * Smart Import — single-action bridge from "just uploaded a file" straight
 * to editable Draft Journal Entries, for the Journal Entries > New screen.
 *
 * This does not reimplement anything: it is a thin orchestration over the
 * exact same steps a person previously had to click through one at a time
 * on the Documents page and the AI Review queue (extract content -> AI
 * extraction/normalization -> AI account suggestion -> accept -> create
 * Draft Journal Entry). Nothing here bypasses any of that pipeline's
 * validation — a transaction that needs a human decision (missing date,
 * foreign currency, no confident account match, etc.) is reported back as
 * "needsAttention" rather than silently skipped or force-created.
 *
 * One statement/document in -> one Draft Journal Entry per transaction out
 * (never one merged entry), matching normal bookkeeping practice. Every
 * created entry keeps its normal source-document/candidate/suggestion
 * links, and is fully editable afterwards like any other Draft.
 */

export type SmartImportCreatedEntry = {
  journalEntryId: string;
  entryNumber: string;
  description: string | null;
  entryDate: string;
  amount: string;
};

export type SmartImportAttentionItem = {
  candidateId: string;
  description: string | null;
  date: string | null;
  amount: string | null;
  reason: string;
};

export type SmartImportOutcome = {
  ok: true;
  documentId: string;
  documentName: string;
  candidateCount: number;
  created: SmartImportCreatedEntry[];
  needsAttention: SmartImportAttentionItem[];
} | {
  ok: false;
  error: string;
};

export async function runSmartImport(
  organizationId: string,
  companyId: string,
  userId: string,
  documentId: string,
  guidance?: string
): Promise<SmartImportOutcome> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false, error: "Company not found." };

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, companyId: company.id },
    select: { id: true, originalFileName: true },
  });
  if (!document) return { ok: false, error: "Document not found." };

  // Extraction already chains into AI normalization on success (see
  // src/documents/processing.ts) — this one call runs the whole "read the
  // document and find transactions" half of the pipeline.
  const extraction = await extractOwnedDocumentContent(organizationId, company.id, documentId, userId, false, guidance);
  if (extraction.error && extraction.status === "FAILED") {
    return { ok: false, error: extraction.error };
  }

  const candidates = await listOwnedCandidates(organizationId, company.id, documentId);
  if (!candidates.length) {
    return { ok: true, documentId, documentName: document.originalFileName, candidateCount: 0, created: [], needsAttention: [] };
  }

  const created: SmartImportCreatedEntry[] = [];
  const needsAttention: SmartImportAttentionItem[] = [];

  for (const candidate of candidates) {
    if (candidate.possibleDuplicate) {
      needsAttention.push({
        candidateId: candidate.id,
        description: candidate.description,
        date: candidate.date,
        amount: candidate.amount ?? candidate.debit ?? candidate.credit,
        reason: "Looks like a possible duplicate of an already-imported transaction — review before creating an entry.",
      });
      continue;
    }

    const suggestion = await generateAccountingAISuggestion(organizationId, company.id, documentId, candidate.id, userId);
    if (!suggestion.ok) {
      needsAttention.push({
        candidateId: candidate.id,
        description: candidate.description,
        date: candidate.date,
        amount: candidate.amount ?? candidate.debit ?? candidate.credit,
        reason: suggestion.error,
      });
      continue;
    }

    const accepted = await acceptAccountingAISuggestion(organizationId, company.id, documentId, candidate.id, userId);
    if (!accepted.ok) {
      needsAttention.push({
        candidateId: candidate.id,
        description: candidate.description,
        date: candidate.date,
        amount: candidate.amount ?? candidate.debit ?? candidate.credit,
        reason: accepted.error,
      });
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
        date: candidate.date,
        amount: candidate.amount ?? candidate.debit ?? candidate.credit,
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
      journalEntryId: draft.entry.id,
      entryNumber: draft.entry.entryNumber,
      description: draft.entry.description,
      entryDate: draft.entry.entryDate.toISOString(),
      amount: (line?.debit && line.debit.toString() !== "0" ? line.debit : line?.credit)?.toString() ?? "0",
    });
  }

  return {
    ok: true,
    documentId,
    documentName: document.originalFileName,
    candidateCount: candidates.length,
    created,
    needsAttention,
  };
}
