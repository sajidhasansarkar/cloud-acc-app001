import { Prisma, type HumanReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { validateJournalEntryBalance } from "@/accounting/journal-entries";

export type ReconciliationResult = "MATCH" | "MISMATCH" | "REVIEW_REQUIRED";

export type ReconciliationCheck = {
  label: string;
  source: string;
  draft: string;
  result: ReconciliationResult;
  note?: string;
};

export type ReviewChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  blocking: boolean;
};

function money(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : value.toFixed(4);
}

function warningValues(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function hasBlockingWarning(warnings: string[]) {
  return warnings.some((warning) =>
    /critical|currency mismatch|requires review|missing|invalid|unresolved/i.test(warning)
  );
}

function sourceDirection(candidate: {
  debit: Prisma.Decimal | null;
  credit: Prisma.Decimal | null;
}) {
  if (candidate.debit?.gt(0)) return "DEBIT";
  if (candidate.credit?.gt(0)) return "CREDIT";
  return "UNKNOWN";
}


export async function getSourceAIDraftReconciliation(
  organizationId: string,
  companyId: string,
  documentId: string,
  candidateId: string
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const candidate = await prisma.normalizedTransactionCandidate.findFirst({
    where: {
      id: candidateId,
      documentId,
      companyId: company.id,
      organizationId,
      document: { id: documentId, companyId: company.id, organizationId },
    },
    include: {
      document: {
        select: {
          id: true,
          originalFileName: true,
          fileType: true,
          documentStatus: true,
          processingResult: {
            select: { pageCount: true, sheetCount: true, rowCount: true, columnCount: true },
          },
        },
      },
      aiReview: {
        include: {
          reviewedBy: { select: { id: true, name: true } },
          humanAccount: { select: { id: true, code: true, name: true, type: true } },
          suggestions: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              suggestedAccount: { select: { id: true, code: true, name: true, type: true } },
            },
          },
          audits: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              action: true,
              provider: true,
              model: true,
              contextVersion: true,
              confidence: true,
              previousHumanReviewStatus: true,
              newHumanReviewStatus: true,
              relevantCorrection: true,
              createdAt: true,
              user: { select: { id: true, name: true } },
              journalEntryId: true,
            },
          },
        },
      },
      draftJournalEntries: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
            include: { account: { select: { id: true, code: true, name: true, isActive: true } } },
          },
          fiscalYear: { select: { id: true, name: true, startDate: true, endDate: true } },
          accountingPeriod: { select: { id: true, name: true, startDate: true, endDate: true, fiscalYearId: true } },
          createdBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!candidate) return null;

  const review = candidate.aiReview;
  const latestSuggestion = review?.suggestions[0] ?? null;
  const draft = candidate.draftJournalEntries[0] ?? null;

  let balance = {
    totalDebit: new Prisma.Decimal(0),
    totalCredit: new Prisma.Decimal(0),
    difference: new Prisma.Decimal(0),
    balanced: false,
  };

  if (draft) {
    const calculated = await validateJournalEntryBalance(draft.id);
    balance = calculated;
  }

  const sourceAmount = candidate.amount ?? candidate.debit ?? candidate.credit ?? null;
  const draftAmount = draft ? balance.totalDebit.equals(balance.totalCredit) ? balance.totalDebit : balance.totalDebit.plus(balance.totalCredit) : null;
  const sourceDir = sourceDirection(candidate);

  const checks: ReconciliationCheck[] = [];

  if (sourceAmount !== null && draftAmount !== null) {
    checks.push({
      label: "Amount",
      source: money(sourceAmount) ?? "—",
      draft: money(draftAmount) ?? "—",
      result: sourceAmount.eq(draftAmount) ? "MATCH" : "MISMATCH",
    });
  } else {
    checks.push({
      label: "Amount",
      source: money(sourceAmount) ?? "—",
      draft: money(draftAmount) ?? "—",
      result: "REVIEW_REQUIRED",
      note: "Source or Draft amount is unavailable.",
    });
  }

  if (candidate.date && draft) {
    checks.push({
      label: "Date",
      source: candidate.date.toISOString().slice(0, 10),
      draft: draft.entryDate.toISOString().slice(0, 10),
      result: candidate.date.toISOString().slice(0, 10) === draft.entryDate.toISOString().slice(0, 10) ? "MATCH" : "MISMATCH",
      note: candidate.date.toISOString().slice(0, 10) === draft.entryDate.toISOString().slice(0, 10)
        ? undefined
        : "DATE OVERRIDDEN",
    });
  } else {
    checks.push({
      label: "Date",
      source: candidate.date?.toISOString().slice(0, 10) ?? "—",
      draft: draft?.entryDate.toISOString().slice(0, 10) ?? "—",
      result: "REVIEW_REQUIRED",
      note: candidate.dateConfidence === "LOW" ? "DATE REQUIRES REVIEW" : undefined,
    });
  }

  if (candidate.reference && draft) {
    checks.push({
      label: "Reference",
      source: candidate.reference,
      draft: draft.reference ?? "—",
      result: candidate.reference === (draft.reference ?? "") ? "MATCH" : "MISMATCH",
    });
  } else {
    checks.push({
      label: "Reference",
      source: candidate.reference ?? "—",
      draft: draft?.reference ?? "—",
      result: candidate.reference === (draft?.reference ?? null) ? "MATCH" : "REVIEW_REQUIRED",
    });
  }

  const aiAccountId = latestSuggestion?.suggestedAccountId ?? null;
  const draftAccountIds = draft?.lines.map((line) => line.accountId) ?? [];
  const aiAccountInDraft = aiAccountId ? draftAccountIds.includes(aiAccountId) : false;
  const humanOverride = Boolean(aiAccountId && draft && draftAccountIds.length > 0 && !aiAccountInDraft);

  checks.push({
    label: "Account",
    source: latestSuggestion?.suggestedAccount
      ? `${latestSuggestion.suggestedAccount.code} — ${latestSuggestion.suggestedAccount.name}`
      : "—",
    draft: draft
      ? draft.lines.map((line) => `${line.account.code} — ${line.account.name}`).join(", ") || "—"
      : "—",
    result: humanOverride ? "REVIEW_REQUIRED" : aiAccountId && aiAccountInDraft ? "MATCH" : "REVIEW_REQUIRED",
    note: humanOverride ? "ACCOUNT OVERRIDDEN BY USER" : undefined,
  });

  const aiDebit = latestSuggestion?.suggestedDebit ?? null;
  const aiCredit = latestSuggestion?.suggestedCredit ?? null;
  const draftDebit = draft ? balance.totalDebit : null;
  const draftCredit = draft ? balance.totalCredit : null;
  const debitCreditMatch =
    draftDebit !== null &&
    draftCredit !== null &&
    ((aiDebit !== null && aiDebit.gt(0) && aiDebit.eq(draftDebit)) ||
      (aiCredit !== null && aiCredit.gt(0) && aiCredit.eq(draftCredit)));

  const sourceDirectionMatch =
    draftDebit !== null &&
    draftCredit !== null &&
    ((sourceDir === "DEBIT" && candidate.debit !== null && candidate.debit.gt(0) && candidate.debit.eq(draftDebit)) ||
      (sourceDir === "CREDIT" && candidate.credit !== null && candidate.credit.gt(0) && candidate.credit.eq(draftCredit)));

  checks.push({
    label: "Debit / Credit",
    source: `Source ${sourceDir} · AI Debit ${money(aiDebit) ?? "—"} / Credit ${money(aiCredit) ?? "—"}`,
    draft: `Debit ${money(draftDebit) ?? "—"} / Credit ${money(draftCredit) ?? "—"}`,
    result: debitCreditMatch && sourceDirectionMatch ? "MATCH" : "REVIEW_REQUIRED",
    note: !sourceDirectionMatch && sourceDir !== "UNKNOWN" ? "Source debit/credit direction requires review." : undefined,
  });

  const sourceCurrency = candidate.currency?.trim().toUpperCase() || null;
  const companyCurrency = company.currency.trim().toUpperCase();
  checks.push({
    label: "Currency",
    source: sourceCurrency ?? "—",
    draft: companyCurrency,
    result: sourceCurrency && sourceCurrency === companyCurrency ? "MATCH" : "REVIEW_REQUIRED",
    note: sourceCurrency && sourceCurrency !== companyCurrency ? "CURRENCY REVIEW REQUIRED" : undefined,
  });

  const warnings = warningValues(candidate.warnings);
  const aiWarnings = latestSuggestion ? warningValues(latestSuggestion.warnings) : [];
  const blockingWarnings = [...warnings, ...aiWarnings].filter((warning) => hasBlockingWarning([warning]));

  const validLines = draft?.lines.filter((line) => {
    const hasDebit = line.debit.gt(0);
    const hasCredit = line.credit.gt(0);
    return (hasDebit ? 1 : 0) + (hasCredit ? 1 : 0) === 1 && line.account.isActive;
  }) ?? [];

  const allLinesStructurallyValid = Boolean(
    draft &&
    draft.lines.length > 0 &&
    draft.lines.every((line) => {
      const hasDebit = line.debit.gt(0);
      const hasCredit = line.credit.gt(0);
      return (hasDebit ? 1 : 0) + (hasCredit ? 1 : 0) === 1 && line.account.isActive;
    })
  );

  const requiredFieldsValid = Boolean(
    draft &&
    draft.status === "DRAFT" &&
    draft.entryDate &&
    draft.fiscalYearId &&
    draft.accountingPeriodId
  );

  const accountValid = Boolean(draft && draft.lines.length > 0 && draft.lines.every((line) => line.account.isActive));
  const periodValid = Boolean(
    draft &&
    draft.entryDate >= draft.fiscalYear.startDate &&
    draft.entryDate <= draft.fiscalYear.endDate &&
    draft.entryDate >= draft.accountingPeriod.startDate &&
    draft.entryDate <= draft.accountingPeriod.endDate &&
    draft.accountingPeriod.fiscalYearId === draft.fiscalYearId
  );
  const sourceReviewed = Boolean(review?.decision && review.decision !== "REJECTED");
  const noBlockingWarnings = blockingWarnings.length === 0;
  const balanced = Boolean(draft && validLines.length >= 2 && balance.balanced);

  const checklist: ReviewChecklistItem[] = [
    { key: "source", label: "Source transaction identified", complete: Boolean(candidate.documentId), blocking: true },
    { key: "date", label: "Date verified", complete: Boolean(candidate.date && review?.decision), blocking: true },
    { key: "amount", label: "Amount verified", complete: Boolean(sourceAmount && draftAmount && sourceAmount.eq(draftAmount)), blocking: true },
    { key: "account", label: "Account reviewed", complete: Boolean(sourceReviewed && accountValid), blocking: true },
    { key: "direction", label: "Debit/Credit reviewed", complete: Boolean(sourceReviewed && draft && sourceDir !== "UNKNOWN" && allLinesStructurallyValid), blocking: true },
    { key: "period", label: "Fiscal period verified", complete: Boolean(periodValid), blocking: true },
    { key: "balanced", label: "Draft balanced", complete: balanced, blocking: true },
  ];

  const canMarkReady =
    Boolean(review) &&
    review.decision !== "REJECTED" &&
    sourceReviewed &&
    requiredFieldsValid &&
    accountValid &&
    periodValid &&
    allLinesStructurallyValid &&
    validLines.length >= 2 &&
    balance.balanced &&
    noBlockingWarnings &&
    checklist.every((item) => !item.blocking || item.complete);

  const displayReviewStatus: HumanReviewStatus =
    review?.humanReviewStatus ?? "PENDING_REVIEW";

  return {
    company: {
      id: company.id,
      displayName: company.displayName,
      currency: company.currency,
    },
    candidate,
    review,
    latestSuggestion,
    draft,
    balance,
    checks,
    checklist,
    canMarkReady,
    displayReviewStatus,
    blockingWarnings,
  };
}

export async function listAIReviewQueue(
  organizationId: string,
  companyId: string,
  filters: {
    status?: HumanReviewStatus;
    documentId?: string;
    confidence?: "HIGH" | "MEDIUM" | "LOW";
    warningState?: "ANY" | "WARNINGS" | "NO_WARNINGS";
    dateFrom?: Date;
    dateTo?: Date;
  } = {}
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const records = await prisma.aIReviewRecord.findMany({
    where: {
      candidate: {
        organizationId,
        companyId: company.id,
        ...(filters.documentId ? { documentId: filters.documentId } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? { date: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
      ...(filters.status ? { humanReviewStatus: filters.status } : {}),
      ...(filters.confidence ? { suggestions: { some: { confidence: filters.confidence } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      candidate: {
        select: {
          id: true,
          documentId: true,
          sourceRowReference: true,
          sourceSheetName: true,
          sourcePageNumber: true,
          sourceRowNumber: true,
          date: true,
          amount: true,
          debit: true,
          credit: true,
          currency: true,
          warnings: true,
          document: { select: { originalFileName: true } },
          aiReviewSuggestions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { confidence: true, warnings: true, suggestedAccount: { select: { code: true, name: true } } },
          },
        },
      },
    },
  });

  return records.filter((record) => {
    const sourceWarnings = warningValues(record.candidate.warnings);
    const aiWarnings = warningValues(record.candidate.aiReviewSuggestions[0]?.warnings);
    const hasWarnings = sourceWarnings.length > 0 || aiWarnings.length > 0;
    return filters.warningState === "WARNINGS"
      ? hasWarnings
      : filters.warningState === "NO_WARNINGS"
        ? !hasWarnings
        : true;
  });
}
