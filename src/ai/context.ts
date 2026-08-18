import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import type { NormalizationConfidence, Prisma } from "@prisma/client";

export const AI_CONTEXT_VERSION = "v1";
const MAX_RELEVANT_ACCOUNTS = 12;
const MAX_SEARCH_TERMS = 6;

export type AIReviewPayload = {
  companyContext: {
    name: string;
    country: string;
    currency: string;
    fiscalYear: { name: string; startDate: string; endDate: string } | null;
    accountingPeriod: { name: string; startDate: string; endDate: string } | null;
  };
  documentContext: {
    documentId: string;
    fileType: string;
    originalFileName: string;
  };
  transactionCandidate: {
    date?: string;
    description?: string;
    reference?: string;
    debit?: string;
    credit?: string;
    amount?: string;
    balance?: string;
    currency?: string;
    transactionType?: string;
    confidence: NormalizationConfidence;
    warnings: string[];
  };
  accountingContext: {
    relevantAccounts: Array<{
      id: string;
      code: string;
      name: string;
      type: string;
      parentAccount: string | null;
    }>;
  };
  sourceReference: {
    documentId: string;
    sheetName: string | null;
    pageNumber: number | null;
    rowNumber: number | null;
    sourceRowReference: string;
  };
};

function toOptionalString(value: Prisma.Decimal | string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const text = value.toString().trim();
  return text || undefined;
}

function searchTerms(candidate: {
  description: string | null;
  reference: string | null;
  transactionType: string | null;
  currency: string | null;
}) {
  const source = [candidate.description, candidate.reference, candidate.transactionType, candidate.currency]
    .filter(Boolean)
    .join(" ");
  const terms = source
    .split(/[^A-Za-z0-9\u0080-\uFFFF]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .filter((term) => !/^\d+$/.test(term));
  return [...new Set(terms.map((term) => term.slice(0, 40)))].slice(0, MAX_SEARCH_TERMS);
}

async function loadRelevantAccounts(companyId: string, candidate: {
  description: string | null;
  reference: string | null;
  transactionType: string | null;
  currency: string | null;
}) {
  const terms = searchTerms(candidate);
  if (!terms.length) return [];

  const accounts = await prisma.account.findMany({
    where: {
      companyId,
      isActive: true,
      OR: terms.flatMap((term) => [
        { code: { contains: term, mode: "insensitive" as const } },
        { name: { contains: term, mode: "insensitive" as const } },
        { subtype: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
      ]),
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentAccount: { select: { name: true } },
    },
    take: MAX_RELEVANT_ACCOUNTS,
    orderBy: [{ code: "asc" }],
  });

  return accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    parentAccount: account.parentAccount?.name ?? null,
  }));
}

async function loadCandidateScope(organizationId: string, companyId: string, documentId: string, candidateId: string) {
  return prisma.normalizedTransactionCandidate.findFirst({
    where: {
      id: candidateId,
      documentId,
      companyId,
      organizationId,
      document: { id: documentId, companyId, organizationId, company: { organizationId } },
    },
    include: {
      document: {
        select: { id: true, originalFileName: true, fileType: true, companyId: true, organizationId: true },
      },
    },
  });
}

async function loadPeriodContext(companyId: string, date: Date | null) {
  if (!date) return { fiscalYear: null, accountingPeriod: null };

  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!fiscalYear) return { fiscalYear: null, accountingPeriod: null };

  const accountingPeriod = await prisma.accountingPeriod.findFirst({
    where: { companyId, fiscalYearId: fiscalYear.id, startDate: { lte: date }, endDate: { gte: date } },
    select: { name: true, startDate: true, endDate: true },
  });
  return { fiscalYear, accountingPeriod };
}

export async function buildAccountingAIContext(
  organizationId: string,
  companyId: string,
  documentId: string,
  candidateId: string
): Promise<AIReviewPayload | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const candidate = await loadCandidateScope(organizationId, company.id, documentId, candidateId);
  if (!candidate || candidate.document.companyId !== company.id || candidate.document.organizationId !== organizationId) return null;

  const periods = await loadPeriodContext(company.id, candidate.date);
  const relevantAccounts = await loadRelevantAccounts(company.id, candidate);
  const warnings = Array.isArray(candidate.warnings) ? candidate.warnings.map(String) : [];

  return {
    companyContext: {
      name: company.displayName || company.legalName,
      country: company.country,
      currency: company.currency,
      fiscalYear: periods.fiscalYear
        ? { name: periods.fiscalYear.name, startDate: periods.fiscalYear.startDate.toISOString(), endDate: periods.fiscalYear.endDate.toISOString() }
        : null,
      accountingPeriod: periods.accountingPeriod
        ? { name: periods.accountingPeriod.name, startDate: periods.accountingPeriod.startDate.toISOString(), endDate: periods.accountingPeriod.endDate.toISOString() }
        : null,
    },
    documentContext: {
      documentId: candidate.document.id,
      fileType: candidate.document.fileType,
      originalFileName: candidate.document.originalFileName,
    },
    transactionCandidate: {
      date: candidate.date?.toISOString(),
      description: candidate.description || undefined,
      reference: candidate.reference || undefined,
      debit: toOptionalString(candidate.debit),
      credit: toOptionalString(candidate.credit),
      amount: toOptionalString(candidate.amount),
      balance: toOptionalString(candidate.balance),
      currency: candidate.currency || undefined,
      transactionType: candidate.transactionType || undefined,
      confidence: candidate.confidence,
      warnings,
    },
    accountingContext: { relevantAccounts },
    sourceReference: {
      documentId: candidate.document.id,
      sheetName: candidate.sourceSheetName,
      pageNumber: candidate.sourcePageNumber,
      rowNumber: candidate.sourceRowNumber,
      sourceRowReference: candidate.sourceRowReference,
    },
  };
}


