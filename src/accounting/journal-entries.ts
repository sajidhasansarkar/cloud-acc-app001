import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JournalEntry, JournalEntryLine, JournalEntrySourceType, JournalEntryStatus } from "@prisma/client";
import {
  getOwnedCompany,
  getOwnedFiscalYear,
  getOwnedAccountingPeriod,
  getOwnedAccount,
  getOwnedJournalEntry,
  getOwnedJournalEntryById,
} from "./access";
import { getOwnedTaxCode } from "@/tax/access";

/**
 * Journal Entry database foundation (Phase 4A-1).
 *
 * This module intentionally does NOT implement: automatic entry numbering,
 * automatic posting to a ledger, file/CSV/Excel import, OCR, AI
 * extraction, bank import, or general ledger/report generation (spec
 * section 17). It only provides the create/read/void operations and the
 * two pieces of reusable server-side validation the spec asks for so a
 * later UI (Phase 4A-3) doesn't have to reimplement them:
 *  - validateEntryDateInPeriod (spec section 7)
 *  - calculateEntryTotals / validateJournalEntryBalance / isEntryBalanced (spec section 9)
 */

export type JournalEntryResult =
  | { ok: true; entry: JournalEntry & { lines: JournalEntryLine[] } }
  | { ok: false; error: string };

export type JournalEntryLineInput = {
  accountId: string;
  taxCodeId?: string;
  description?: string;
  reference?: string;
  debit: Prisma.Decimal.Value;
  credit: Prisma.Decimal.Value;
};

export type CreateJournalEntryInput = {
  companyId: string;
  fiscalYearId: string;
  accountingPeriodId: string;
  entryNumber: string;
  entryDate: Date;
  reference?: string;
  description?: string;
  label?: string;
  sourceType?: JournalEntrySourceType;
  lines: JournalEntryLineInput[];
  // Phase 4B-6 traceability (spec section 9). All optional and independent
  // of each other — a manually created entry (the common case) simply
  // omits them. When provided, each is re-verified against `companyId`
  // below rather than trusted as-is, even though callers within this
  // codebase (src/accounting/journal-entry-drafts.ts) already verify
  // ownership themselves before calling createJournalEntry.
  sourceDocumentId?: string;
  transactionCandidateId?: string;
  aiSuggestionId?: string;
};

// ------------------------------
// Reusable validation (spec sections 7, 8, 9)
// ------------------------------

/**
 * Validates the fiscal-year / accounting-period / entry-date relationship
 * (spec section 7):
 *  - The accounting period must belong to the given fiscal year.
 *  - The fiscal year and the accounting period must both belong to
 *    `companyId` (redundant with the ownership lookups below in practice,
 *    but checked explicitly here so this function is safe to call on its
 *    own, e.g. from a future UI, without redoing the ownership lookups).
 *  - `entryDate` must fall within the accounting period's [startDate,
 *    endDate] range (inclusive).
 *
 * Pure validation against already-fetched rows — does not query the
 * database itself, so it can be reused by both createJournalEntry below
 * and, later, the Phase 4A-3 UI (e.g. for live client-side-style checks
 * via a server action) without duplicating the logic.
 */
export function validateEntryDateInPeriod(
  fiscalYear: { id: string; companyId: string },
  accountingPeriod: {
    id: string;
    companyId: string;
    fiscalYearId: string;
    startDate: Date;
    endDate: Date;
  },
  entryDate: Date
): { ok: true } | { ok: false; error: string } {
  if (accountingPeriod.fiscalYearId !== fiscalYear.id) {
    return { ok: false, error: "The accounting period does not belong to the selected fiscal year." };
  }
  if (accountingPeriod.companyId !== fiscalYear.companyId) {
    return { ok: false, error: "The fiscal year and accounting period must belong to the same company." };
  }
  if (entryDate < accountingPeriod.startDate || entryDate > accountingPeriod.endDate) {
    return { ok: false, error: "The entry date does not fall within the selected accounting period." };
  }
  return { ok: true };
}

/**
 * Sums the debit and credit columns of a set of lines. Uses Prisma.Decimal
 * throughout (never plain JS numbers) to avoid floating-point drift on
 * money amounts (spec section 8).
 */
export function calculateEntryTotals(lines: { debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }[]): {
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
} {
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  for (const line of lines) {
    totalDebit = totalDebit.plus(line.debit);
    totalCredit = totalCredit.plus(line.credit);
  }
  return { totalDebit, totalCredit };
}

/**
 * Reusable balance check (spec section 9): a journal entry is balanced
 * only when Total Debit = Total Credit. This does not implement automatic
 * posting — it's the single source of truth for "is this entry balanced"
 * that both createJournalEntry (below) and the future Phase 4A-3 UI
 * should call, rather than each re-deriving the comparison.
 */
export function isEntryBalanced(lines: { debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }[]): boolean {
  const { totalDebit, totalCredit } = calculateEntryTotals(lines);
  return totalDebit.equals(totalCredit);
}

/**
 * Reusable database-backed balance calculation for a journal entry.
 *
 * The caller must have already established that the journalEntryId belongs
 * to the current organization/company (the UI does this through
 * getOwnedJournalEntry). The calculation itself always uses Prisma.Decimal.
 */
export async function validateJournalEntryBalance(journalEntryId: string): Promise<{
  balanced: boolean;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  difference: Prisma.Decimal;
}> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId },
    select: { debit: true, credit: true },
    orderBy: { lineNumber: "asc" },
  });

  const { totalDebit, totalCredit } = calculateEntryTotals(lines);
  return {
    balanced: totalDebit.equals(totalCredit),
    totalDebit,
    totalCredit,
    difference: totalDebit.minus(totalCredit),
  };
}

/**
 * Validates one journal entry line in isolation:
 *  - debit / credit must each be >= 0 (spec section 8 — no negative
 *    amounts; a "negative" amount is represented by using the opposite
 *    column, not a negative number).
 *  - can't have both a debit and a credit at once (a line is one side of
 *    one entry — standard double-entry shape; spec section 9).
 *
 * Deliberately does NOT reject a line that is zero on both sides. Every
 * entry in this system is currently created/edited as a DRAFT, and spec
 * section 13 (Phase 4A-3A) requires drafts to be saveable with "one
 * incomplete line" / "multiple incomplete lines" — an incomplete line is
 * exactly debit=0 and credit=0 (spec section 9). Rejecting that here would
 * make saving an incomplete draft impossible. Whether an entry's lines are
 * complete/balanced enough to POST is a separate concern for Phase 4A-3B.
 */
function validateLineAmounts(
  line: JournalEntryLineInput,
  options: { allowIncompleteDraftLine?: boolean } = {}
): { ok: true; complete: boolean } | { ok: false; error: string } {
  let debit: Prisma.Decimal;
  let credit: Prisma.Decimal;

  try {
    debit = new Prisma.Decimal(line.debit);
    credit = new Prisma.Decimal(line.credit);
  } catch {
    return { ok: false, error: "Enter valid debit and credit amounts." };
  }

  if (debit.isNegative() || credit.isNegative()) {
    return { ok: false, error: "Amount cannot be negative." };
  }
  if (!debit.isZero() && !credit.isZero()) {
    return { ok: false, error: "Debit and Credit cannot both contain values." };
  }

  const complete = debit.gt(0) || credit.gt(0);
  if (!complete && !options.allowIncompleteDraftLine) {
    return { ok: false, error: "Debit or Credit amount is required." };
  }

  return { ok: true, complete };
}

/**
 * Shared server-side line verification. Ownership is always resolved from
 * the authenticated organization + company; client ids are never treated
 * as proof of ownership. Incomplete zero/zero lines are permitted only for
 * draft saves, while posting validation requires every line to be complete.
 */
async function verifyLines(
  organizationId: string,
  companyId: string,
  lines: JournalEntryLineInput[],
  options: { allowIncompleteDraftLines: boolean; requireActiveAccounts?: boolean }
): Promise<{ ok: true; validLineCount: number } | { ok: false; error: string }> {
  const uniqueAccountIds = [...new Set(lines.map((line) => line.accountId.trim()).filter(Boolean))];

  if (uniqueAccountIds.length !== lines.length) {
    return { ok: false, error: "Account is required." };
  }

  for (const accountId of uniqueAccountIds) {
    const account = await getOwnedAccount(organizationId, companyId, accountId);
    if (!account) {
      return { ok: false, error: "One or more lines reference an account outside this company." };
    }
    if (options.requireActiveAccounts && !account.isActive) {
      return { ok: false, error: "One or more journal lines reference an inactive account." };
    }
  }

  const uniqueTaxCodeIds = [...new Set(lines.map((line) => line.taxCodeId?.trim()).filter(Boolean) as string[])];
  for (const taxCodeId of uniqueTaxCodeIds) {
    const taxCode = await getOwnedTaxCode(organizationId, companyId, taxCodeId);
    if (!taxCode) {
      return { ok: false, error: "One or more journal lines reference a tax code outside this company." };
    }
  }

  let validLineCount = 0;
  for (const line of lines) {
    const lineCheck = validateLineAmounts(line, {
      allowIncompleteDraftLine: options.allowIncompleteDraftLines,
    });
    if (!lineCheck.ok) return lineCheck;
    if (lineCheck.complete) validLineCount += 1;
  }

  return { ok: true, validLineCount };
}

/**
 * Validates all invariants required before a future POST action. This
 * function deliberately performs no status mutation and can be reused by
 * the future posting workflow without duplicating accounting rules.
 */
export type JournalEntryReviewValidation = {
  valid: boolean;
  errors: string[];
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  difference: Prisma.Decimal;
  balanced: boolean;
};

/**
 * Detailed server-side validation for the human review gate. It composes the
 * existing fiscal-period, line, ownership, and balance validators instead of
 * duplicating accounting rules in the review UI.
 */
export async function validateJournalEntryForReview(
  organizationId: string,
  journalEntryId: string
): Promise<JournalEntryReviewValidation> {
  const entry = await getOwnedJournalEntryById(organizationId, journalEntryId);
  if (!entry) {
    return {
      valid: false,
      errors: ["Journal entry not found."],
      totalDebit: new Prisma.Decimal(0),
      totalCredit: new Prisma.Decimal(0),
      difference: new Prisma.Decimal(0),
      balanced: false,
    };
  }

  const errors: string[] = [];
  const fiscalYear = await getOwnedFiscalYear(organizationId, entry.companyId, entry.fiscalYearId);
  if (!fiscalYear || fiscalYear.companyId !== entry.companyId) {
    errors.push("Fiscal year is not valid for this company.");
  }

  const accountingPeriod = await getOwnedAccountingPeriod(
    organizationId,
    entry.companyId,
    entry.accountingPeriodId
  );
  if (!accountingPeriod) {
    errors.push("Accounting period is not valid for this company.");
  }

  if (fiscalYear && accountingPeriod) {
    const dateCheck = validateEntryDateInPeriod(fiscalYear, accountingPeriod, entry.entryDate);
    if (!dateCheck.ok) errors.push(dateCheck.error);
  }

  const linesCheck = await verifyLines(
    organizationId,
    entry.companyId,
    entry.lines.map((line) => ({
      accountId: line.accountId,
      taxCodeId: line.taxCodeId ?? undefined,
      description: line.description ?? undefined,
      reference: line.reference ?? undefined,
      debit: line.debit,
      credit: line.credit,
    })),
    { allowIncompleteDraftLines: false, requireActiveAccounts: true }
  );

  if (!linesCheck.ok) {
    errors.push(linesCheck.error);
  } else if (linesCheck.validLineCount < 2) {
    errors.push("At least two valid journal lines are required.");
  }

  const balance = await validateJournalEntryBalance(entry.id);
  if (!balance.balanced) errors.push("Journal entry is not balanced.");

  return {
    valid: errors.length === 0,
    errors,
    totalDebit: balance.totalDebit,
    totalCredit: balance.totalCredit,
    difference: balance.difference,
    balanced: balance.balanced,
  };
}

/**
 * Existing posting validator now delegates to the same review validation so
 * the accounting rules remain single-sourced. Posting itself is still a
 * separate later action; this function only validates readiness.
 */
export async function validateJournalEntryForPosting(
  organizationId: string,
  journalEntryId: string
): Promise<{ ok: true; balanced: true; totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal; difference: Prisma.Decimal } | { ok: false; error: string }> {
  const validation = await validateJournalEntryForReview(organizationId, journalEntryId);
  if (!validation.valid) return { ok: false, error: validation.errors[0] ?? "Journal entry failed validation." };
  return {
    ok: true,
    balanced: true,
    totalDebit: validation.totalDebit,
    totalCredit: validation.totalCredit,
    difference: validation.difference,
  };
}

// ------------------------------
// Create
// ------------------------------

/**
 * Creates a journal entry with its lines inside a single transaction.
 * Always created as DRAFT (spec section 2 — no posting logic yet).
 *
 * Verifies, in order:
 *  - the company belongs to the caller's organization,
 *  - the fiscal year and accounting period belong to that company
 *    (spec section 6),
 *  - the entry date / period / fiscal year relationship (spec section 7,
 *    via validateEntryDateInPeriod),
 *  - entryNumber is non-empty and unique within the company (spec
 *    section 10),
 *  - there is at least one line, every line's account belongs to the same
 *    company (spec section 5 — no cross-company account references), and
 *    every line's amounts are valid (spec section 8).
 *
 * Does NOT require the entry to be balanced to save it as a DRAFT — spec
 * section 9 only asks for the balance check to exist and be reusable, not
 * to gate saving (a draft is allowed to be a work in progress). The
 * balanced check (isEntryBalanced) is exported for the future UI /
 * posting step to call when it matters.
 */
export async function createJournalEntry(
  organizationId: string,
  createdById: string,
  input: CreateJournalEntryInput
): Promise<JournalEntryResult> {
  const company = await getOwnedCompany(organizationId, input.companyId);
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  const fiscalYear = await getOwnedFiscalYear(organizationId, company.id, input.fiscalYearId);
  if (!fiscalYear) {
    return { ok: false, error: "Fiscal year not found for this company." };
  }

  const accountingPeriod = await getOwnedAccountingPeriod(
    organizationId,
    company.id,
    input.accountingPeriodId
  );
  if (!accountingPeriod) {
    return { ok: false, error: "Accounting period not found for this company." };
  }

  const dateCheck = validateEntryDateInPeriod(fiscalYear, accountingPeriod, input.entryDate);
  if (!dateCheck.ok) {
    return { ok: false, error: dateCheck.error };
  }

  const entryNumber = input.entryNumber.trim();
  if (!entryNumber) {
    return { ok: false, error: "Entry number is required." };
  }
  const duplicate = await prisma.journalEntry.findFirst({
    where: { companyId: company.id, entryNumber },
  });
  if (duplicate) {
    return { ok: false, error: "This entry number is already used for this company." };
  }

  // Phase 4A-2 (basic Journal Entry UI) saves a DRAFT with no lines at
  // all — the complete Debit/Credit line entry system and balance
  // validation are Phase 4A-3, so an empty `lines` array is valid here.
  // Whenever lines *are* provided (now or once 4A-3 lands), they still go
  // through the same account-ownership and amount checks below.

  // Verify every referenced account exists and belongs to this company
  // (spec section 5), and every line's amounts are valid (spec section 8),
  // before creating anything.
  const linesCheck = await verifyLines(organizationId, company.id, input.lines, { allowIncompleteDraftLines: true });
  if (!linesCheck.ok) {
    return { ok: false, error: linesCheck.error };
  }

  // Phase 4B-6 (spec section 9/16): if traceability ids were supplied,
  // re-verify each belongs to this same company/organization before
  // writing anything — never trust a client-provided documentId/
  // candidateId/suggestionId, even indirectly via a caller that already
  // checked once.
  if (input.sourceDocumentId) {
    const document = await prisma.document.findFirst({
      where: { id: input.sourceDocumentId, companyId: company.id, organizationId },
      select: { id: true },
    });
    if (!document) return { ok: false, error: "Source document not found for this company." };
  }
  if (input.transactionCandidateId) {
    const candidate = await prisma.normalizedTransactionCandidate.findFirst({
      where: { id: input.transactionCandidateId, companyId: company.id, organizationId },
      select: { id: true },
    });
    if (!candidate) return { ok: false, error: "Transaction candidate not found for this company." };
  }
  if (input.aiSuggestionId) {
    const suggestion = await prisma.aIReviewSuggestion.findFirst({
      where: { id: input.aiSuggestionId, candidate: { companyId: company.id, organizationId } },
      select: { id: true },
    });
    if (!suggestion) return { ok: false, error: "AI suggestion not found for this company." };
  }

  const entry = await prisma.journalEntry.create({
    data: {
      companyId: company.id,
      fiscalYearId: fiscalYear.id,
      accountingPeriodId: accountingPeriod.id,
      entryNumber,
      entryDate: input.entryDate,
      reference: input.reference?.trim() || null,
      description: input.description?.trim() || null,
      label: input.label?.trim() || null,
      status: "DRAFT",
      sourceType: input.sourceType ?? "MANUAL",
      sourceDocumentId: input.sourceDocumentId ?? null,
      transactionCandidateId: input.transactionCandidateId ?? null,
      aiSuggestionId: input.aiSuggestionId ?? null,
      createdById,
      lines: {
        create: input.lines.map((line, index) => ({
          accountId: line.accountId,
          taxCodeId: line.taxCodeId ?? null,
          description: line.description?.trim() || null,
          reference: line.reference?.trim() || null,
          debit: line.debit,
          credit: line.credit,
          lineNumber: index + 1,
        })),
      },
    },
    include: { lines: true },
  });

  return { ok: true, entry };
}

// ------------------------------
// Read
// ------------------------------

/**
 * Fetches a single journal entry (with its lines) scoped to the caller's
 * organization + company.
 */
export async function getJournalEntry(organizationId: string, companyId: string, journalEntryId: string) {
  return getOwnedJournalEntry(organizationId, companyId, journalEntryId);
}

/**
 * Lists journal entries for a company, most recent entry date first.
 * Returns null if the company doesn't exist / doesn't belong to the
 * caller's organization. Optional filters mirror fields a future
 * search/filter UI (spec section 11) will realistically narrow by — none
 * required, and none implement any real search/filter UI here.
 */

export type ReadyForPostingSort = "entryDate" | "entryNumber" | "totalDebit" | "totalCredit";

export type ListReadyForPostingInput = {
  search?: string;
  date?: Date;
  fiscalYearId?: string;
  accountingPeriodId?: string;
  status?: JournalEntryStatus;
  sort?: ReadyForPostingSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ReadyForPostingRow = {
  id: string;
  entryNumber: string;
  entryDate: Date;
  reference: string | null;
  description: string | null;
  fiscalYearId: string;
  fiscalYearName: string;
  fiscalYearStatus: "OPEN" | "CLOSED" | "LOCKED";
  accountingPeriodId: string;
  accountingPeriodName: string;
  accountingPeriodStatus: "OPEN" | "CLOSED" | "LOCKED";
  status: "READY_FOR_POSTING";
  totalDebit: string;
  totalCredit: string;
  difference: string;
  readinessErrors: string[];
};

export type ReadyForPostingListResult = {
  entries: ReadyForPostingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    totalEntries: number;
    totalDebit: string;
    totalCredit: string;
  };
};

/**
 * Phase 4B-9: server-side Ready-for-Posting queue. The query is always
 * company/organization scoped and only selects READY_FOR_POSTING entries.
 * Totals and total-debit/credit sorting are calculated in PostgreSQL so the
 * browser never receives the full queue just to paginate or sort it.
 */
export async function listReadyForPostingJournalEntries(
  organizationId: string,
  companyId: string,
  input: ListReadyForPostingInput = {}
): Promise<ReadyForPostingListResult | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const sort = input.sort ?? "entryDate";
  const direction = input.direction === "asc" ? "asc" : "desc";
  const conditions: Prisma.Sql[] = [
    Prisma.sql`je."companyId" = ${company.id}`,
    Prisma.sql`je."status" = 'READY_FOR_POSTING'`,
  ];

  const search = input.search?.trim();
  if (search) {
    conditions.push(Prisma.sql`(
      je."entryNumber" ILIKE '%' || ${search} || '%'
      OR COALESCE(je."reference", '') ILIKE '%' || ${search} || '%'
      OR COALESCE(je."description", '') ILIKE '%' || ${search} || '%'
    )`);
  }
  if (input.date) {
    const start = startOfUtcDay(input.date);
    const end = endOfUtcDay(input.date);
    conditions.push(Prisma.sql`je."entryDate" >= ${start} AND je."entryDate" < ${end}`);
  }
  if (input.fiscalYearId) conditions.push(Prisma.sql`je."fiscalYearId" = ${input.fiscalYearId}`);
  if (input.accountingPeriodId) conditions.push(Prisma.sql`je."accountingPeriodId" = ${input.accountingPeriodId}`);
  if (input.status && input.status !== "READY_FOR_POSTING") return {
    entries: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 0,
    summary: { totalEntries: 0, totalDebit: "0.0000", totalCredit: "0.0000" },
  };

  const whereSql = Prisma.join(conditions, " AND ");
  const orderColumn = sort === "entryNumber"
    ? Prisma.raw('je."entryNumber"')
    : sort === "totalDebit"
      ? Prisma.raw('total_debit')
      : sort === "totalCredit"
        ? Prisma.raw('total_credit')
        : Prisma.raw('je."entryDate"');
  const directionSql = Prisma.raw(direction.toUpperCase());
  const offset = (page - 1) * pageSize;

  type QueueDbRow = {
    id: string;
    entryNumber: string;
    entryDate: Date;
    reference: string | null;
    description: string | null;
    fiscalYearId: string;
    fiscalYearName: string;
    fiscalYearStatus: "OPEN" | "CLOSED" | "LOCKED";
    accountingPeriodId: string;
    accountingPeriodName: string;
    accountingPeriodStatus: "OPEN" | "CLOSED" | "LOCKED";
    status: "READY_FOR_POSTING";
    totalDebit: Prisma.Decimal;
    totalCredit: Prisma.Decimal;
    difference: Prisma.Decimal;
    totalCount: bigint;
  };

  const rows = await prisma.$queryRaw<QueueDbRow[]>(Prisma.sql`
    SELECT
      je."id" AS id,
      je."entryNumber" AS "entryNumber",
      je."entryDate" AS "entryDate",
      je."reference" AS reference,
      je."description" AS description,
      fy."id" AS "fiscalYearId",
      fy."name" AS "fiscalYearName",
      fy."status" AS "fiscalYearStatus",
      ap."id" AS "accountingPeriodId",
      ap."name" AS "accountingPeriodName",
      ap."status" AS "accountingPeriodStatus",
      je."status" AS status,
      COALESCE(SUM(jel."debit"), 0) AS total_debit,
      COALESCE(SUM(jel."credit"), 0) AS total_credit,
      COALESCE(SUM(jel."debit"), 0) - COALESCE(SUM(jel."credit"), 0) AS difference,
      COUNT(*) OVER() AS "totalCount"
    FROM "journal_entries" je
    INNER JOIN "fiscal_years" fy ON fy."id" = je."fiscalYearId"
    INNER JOIN "accounting_periods" ap ON ap."id" = je."accountingPeriodId"
    LEFT JOIN "journal_entry_lines" jel ON jel."journalEntryId" = je."id"
    WHERE ${whereSql}
    GROUP BY
      je."id", je."entryNumber", je."entryDate", je."reference", je."description",
      fy."id", fy."name", fy."status", ap."id", ap."name", ap."status", je."status"
    ORDER BY ${orderColumn} ${directionSql}, je."id" ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const summaryRows = await prisma.$queryRaw<Array<{ totalEntries: bigint; totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal }>>(Prisma.sql`
    SELECT
      COUNT(DISTINCT je."id") AS "totalEntries",
      COALESCE(SUM(jel."debit"), 0) AS "totalDebit",
      COALESCE(SUM(jel."credit"), 0) AS "totalCredit"
    FROM "journal_entries" je
    LEFT JOIN "journal_entry_lines" jel ON jel."journalEntryId" = je."id"
    WHERE ${whereSql}
  `);

  const total = rows[0] ? Number(rows[0].totalCount) : Number(summaryRows[0]?.totalEntries ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;

  const entries: ReadyForPostingRow[] = [];
  for (const row of rows) {
    const readyCheck = await validateReadyForPostingJournalEntry(organizationId, company.id, row.id);
    const readinessErrors = readyCheck.valid ? [] : readyCheck.errors;
    entries.push({
      id: row.id,
      entryNumber: row.entryNumber,
      entryDate: row.entryDate,
      reference: row.reference,
      description: row.description,
      fiscalYearId: row.fiscalYearId,
      fiscalYearName: row.fiscalYearName,
      fiscalYearStatus: row.fiscalYearStatus,
      accountingPeriodId: row.accountingPeriodId,
      accountingPeriodName: row.accountingPeriodName,
      accountingPeriodStatus: row.accountingPeriodStatus,
      status: "READY_FOR_POSTING",
      totalDebit: row.totalDebit.toFixed(4),
      totalCredit: row.totalCredit.toFixed(4),
      difference: row.difference.toFixed(4),
      readinessErrors: [...new Set(readinessErrors)],
    });
  }

  const summary = summaryRows[0];
  return {
    entries,
    total,
    page: safePage,
    pageSize,
    totalPages,
    summary: {
      totalEntries: Number(summary?.totalEntries ?? 0),
      totalDebit: (summary?.totalDebit ?? new Prisma.Decimal(0)).toFixed(4),
      totalCredit: (summary?.totalCredit ?? new Prisma.Decimal(0)).toFixed(4),
    },
  };
}

/**
 * Re-checks a READY_FOR_POSTING entry immediately before any future posting
 * preparation. A closed/locked fiscal year or accounting period makes the
 * previously-approved entry stale and requires human review again.
 */
export async function validateReadyForPostingJournalEntry(
  organizationId: string,
  companyId: string,
  journalEntryId: string
): Promise<{ valid: true } | { valid: false; errors: string[] }> {
  const entry = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!entry) return { valid: false, errors: ["Journal entry not found."] };
  if (entry.status !== "READY_FOR_POSTING") {
    return { valid: false, errors: ["This journal entry requires review before posting."] };
  }

  const validation = await validateJournalEntryForReview(organizationId, journalEntryId);
  const errors = [...validation.errors];
  if (entry.fiscalYear.status !== "OPEN") errors.push(`Fiscal year is ${entry.fiscalYear.status.toLowerCase()}.`);
  if (entry.accountingPeriod.status !== "OPEN") errors.push(`Accounting period is ${entry.accountingPeriod.status.toLowerCase()}.`);

  return errors.length ? { valid: false, errors: [...new Set(errors)] } : { valid: true };
}

export type JournalEntryListSort =
  | "entryDate"
  | "entryNumber"
  | "reference"
  | "status"
  | "createdAt";

export type JournalEntryListDatePreset = "today" | "this_month";

export type ListJournalEntriesInput = {
  search?: string;
  status?: JournalEntryStatus;
  sourceType?: JournalEntrySourceType;
  fiscalYearId?: string;
  accountingPeriodId?: string;
  label?: string;
  reference?: string;
  datePreset?: JournalEntryListDatePreset;
  startDate?: Date;
  endDate?: Date;
  sort?: JournalEntryListSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type JournalEntryListResult = {
  entries: (JournalEntry & { createdBy: { id: string; name: string } | null })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

/**
 * Server-side Journal Entry list query for Phase 4A-4B. Every predicate is
 * applied inside the company-scoped Prisma query, so the browser can never
 * search or filter records outside the authenticated user's organization and
 * selected company.
 */
export async function listJournalEntries(
  organizationId: string,
  companyId: string,
  input: ListJournalEntriesInput = {}
): Promise<JournalEntryListResult | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const sort = input.sort ?? "entryDate";
  const direction = input.direction ?? "desc";

  const where: Prisma.JournalEntryWhereInput = {
    companyId: company.id,
  };

  const search = input.search?.trim();
  if (search) {
    where.OR = [
      { entryNumber: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { label: { contains: search, mode: "insensitive" } },
    ];
  }

  if (input.status) where.status = input.status;
  if (input.sourceType) where.sourceType = input.sourceType;
  if (input.fiscalYearId) where.fiscalYearId = input.fiscalYearId;
  if (input.accountingPeriodId) where.accountingPeriodId = input.accountingPeriodId;
  if (input.label) where.label = { equals: input.label };
  if (input.reference) {
    where.reference = { contains: input.reference.trim(), mode: "insensitive" };
  }

  const now = new Date();
  if (input.datePreset === "today") {
    where.entryDate = { gte: startOfUtcDay(now), lt: endOfUtcDay(now) };
  } else if (input.datePreset === "this_month") {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    where.entryDate = { gte: monthStart, lt: nextMonthStart };
  } else if (input.startDate || input.endDate) {
    const range: Prisma.DateTimeFilter = {};
    if (input.startDate) range.gte = startOfUtcDay(input.startDate);
    if (input.endDate) range.lt = endOfUtcDay(input.endDate);
    where.entryDate = range;
  }

  const primaryOrder: Prisma.JournalEntryOrderByWithRelationInput =
    sort === "entryDate"
      ? { entryDate: direction }
      : sort === "entryNumber"
        ? { entryNumber: direction }
        : sort === "reference"
          ? { reference: direction }
          : sort === "status"
            ? { status: direction }
            : { createdAt: direction };
  const orderBy: Prisma.JournalEntryOrderByWithRelationInput[] = [primaryOrder];
  if (sort !== "entryDate") orderBy.push({ entryDate: "desc" });
  orderBy.push({ id: "desc" });

  const [total, entries] = await prisma.$transaction([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  // If a stale URL points beyond the final page, fetch the final page rather
  // than returning an empty table while still reporting the correct count.
  if (safePage !== page && total > 0) {
    const finalEntries = await prisma.journalEntry.findMany({
      where,
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy,
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });
    return { entries: finalEntries, total, page: safePage, pageSize, totalPages };
  }

  return { entries, total, page: safePage, pageSize, totalPages };
}

export async function listJournalEntryLabels(organizationId: string, companyId: string): Promise<string[] | null> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  const rows = await prisma.journalEntry.findMany({
    where: { companyId: company.id, label: { not: null } },
    select: { label: true },
    distinct: ["label"],
    orderBy: { label: "asc" },
  });

  return rows.map((row) => row.label).filter((label): label is string => Boolean(label));
}

// ------------------------------
// Update (Phase 4A-2 — basic header editing only)
// ------------------------------

export type UpdateJournalEntryHeaderInput = {
  companyId: string;
  fiscalYearId: string;
  accountingPeriodId: string;
  entryDate: Date;
  reference?: string;
  description?: string;
  label?: string;
  sourceType?: JournalEntrySourceType;
};

/**
 * Updates a journal entry's basic header fields (spec section 10):
 * entryDate, fiscalYearId, accountingPeriodId, reference, description,
 * label, sourceType. Deliberately does NOT touch entryNumber, status, or
 * lines — entryNumber isn't in the editable field list, status changes go
 * through setJournalEntryStatus, and line editing is Phase 4A-3.
 *
 * Only DRAFT entries may be edited (spec section 10: "Do not allow editing
 * POSTED entries" / "VOID entries should not be treated as normal
 * editable entries").
 */
export async function updateJournalEntryHeader(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  input: UpdateJournalEntryHeaderInput
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) {
    return { ok: false, error: "Journal entry not found." };
  }
  if (existing.status !== "DRAFT") {
    return { ok: false, error: `A ${existing.status} journal entry cannot be edited.` };
  }

  const fiscalYear = await getOwnedFiscalYear(organizationId, companyId, input.fiscalYearId);
  if (!fiscalYear) {
    return { ok: false, error: "Fiscal year not found for this company." };
  }

  const accountingPeriod = await getOwnedAccountingPeriod(
    organizationId,
    companyId,
    input.accountingPeriodId
  );
  if (!accountingPeriod) {
    return { ok: false, error: "Accounting period not found for this company." };
  }

  const dateCheck = validateEntryDateInPeriod(fiscalYear, accountingPeriod, input.entryDate);
  if (!dateCheck.ok) {
    return { ok: false, error: dateCheck.error };
  }

  const entry = await prisma.journalEntry.update({
    where: { id: existing.id },
    data: {
      fiscalYearId: fiscalYear.id,
      accountingPeriodId: accountingPeriod.id,
      entryDate: input.entryDate,
      reference: input.reference?.trim() || null,
      description: input.description?.trim() || null,
      label: input.label?.trim() || null,
      sourceType: input.sourceType ?? existing.sourceType,
    },
    include: { lines: true },
  });

  return { ok: true, entry };
}

// ------------------------------
// Update (Phase 4A-3A — header + journal lines)
// ------------------------------

export type UpdateJournalEntryWithLinesInput = UpdateJournalEntryHeaderInput & {
  lines: JournalEntryLineInput[];
};

/**
 * Updates a DRAFT journal entry's header fields (reusing the same checks
 * as updateJournalEntryHeader above) and replaces its journal lines in the
 * same transaction (spec section 15 — Edit Draft: add/remove lines, edit
 * account/description/reference/debit/credit).
 *
 * Only DRAFT entries may be edited (spec section 15). Lines are replaced
 * wholesale (delete all, recreate in order) rather than diffed line by
 * line — simpler and correct here because journal lines have no identity
 * meaningful outside their parent entry, and lineNumber is always
 * recomputed from the submitted order anyway.
 *
 * Does not require the lines to be balanced or complete — same reasoning
 * as createJournalEntry (spec section 13): a DRAFT can be saved with no
 * lines, incomplete lines, or unbalanced lines. Balance validation is
 * Phase 4A-3B.
 */
export async function updateJournalEntry(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  input: UpdateJournalEntryWithLinesInput,
  userId?: string
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) {
    return { ok: false, error: "Journal entry not found." };
  }
  if (existing.status !== "DRAFT") {
    return { ok: false, error: `A ${existing.status} journal entry cannot be edited.` };
  }

  const fiscalYear = await getOwnedFiscalYear(organizationId, companyId, input.fiscalYearId);
  if (!fiscalYear) {
    return { ok: false, error: "Fiscal year not found for this company." };
  }

  const accountingPeriod = await getOwnedAccountingPeriod(
    organizationId,
    companyId,
    input.accountingPeriodId
  );
  if (!accountingPeriod) {
    return { ok: false, error: "Accounting period not found for this company." };
  }

  const dateCheck = validateEntryDateInPeriod(fiscalYear, accountingPeriod, input.entryDate);
  if (!dateCheck.ok) {
    return { ok: false, error: dateCheck.error };
  }

  const linesCheck = await verifyLines(organizationId, companyId, input.lines, { allowIncompleteDraftLines: true });
  if (!linesCheck.ok) {
    return { ok: false, error: linesCheck.error };
  }

  const entry = await prisma.$transaction(async (tx) => {
    const current = await tx.journalEntry.findFirst({
      where: { id: existing.id, company: { organizationId } },
      select: {
        id: true,
        companyId: true,
        status: true,
        transactionCandidateId: true,
        aiSuggestionId: true,
      },
    });

    if (!current || current.companyId !== companyId) {
      throw new Error("JOURNAL_ENTRY_NOT_FOUND");
    }
    if (current.status !== "DRAFT") {
      throw new Error("JOURNAL_ENTRY_NOT_EDITABLE");
    }

    await tx.journalEntry.update({
      where: { id: current.id },
      data: {
        fiscalYearId: fiscalYear.id,
        accountingPeriodId: accountingPeriod.id,
        entryDate: input.entryDate,
        reference: input.reference?.trim() || null,
        description: input.description?.trim() || null,
        label: input.label?.trim() || null,
        sourceType: input.sourceType ?? existing.sourceType,
      },
    });

    await tx.journalEntryLine.deleteMany({ where: { journalEntryId: existing.id } });

    if (current.transactionCandidateId && userId) {
      const review = await tx.aIReviewRecord.findUnique({
        where: { candidateId: current.transactionCandidateId },
        select: { humanReviewStatus: true },
      });

      if (review) {
        await tx.aIReviewRecord.update({
          where: { candidateId: current.transactionCandidateId },
          data: {
            humanReviewStatus: "NEEDS_CORRECTION",
            reviewedById: userId,
            reviewedAt: new Date(),
          },
        });

        await tx.aIReviewAudit.create({
          data: {
            candidateId: current.transactionCandidateId,
            suggestionId: current.aiSuggestionId,
            action: "EDITED",
            userId,
            previousHumanReviewStatus: review.humanReviewStatus,
            newHumanReviewStatus: "NEEDS_CORRECTION",
            relevantCorrection: "Draft Journal Entry edited by human; reconciliation must be re-checked.",
            journalEntryId: current.id,
          },
        });
      }
    }

    if (input.lines.length > 0) {
      await tx.journalEntryLine.createMany({
        data: input.lines.map((line, index) => ({
          journalEntryId: existing.id,
          accountId: line.accountId,
          taxCodeId: line.taxCodeId ?? null,
          description: line.description?.trim() || null,
          reference: line.reference?.trim() || null,
          debit: line.debit,
          credit: line.credit,
          lineNumber: index + 1,
        })),
      });
    }

    return tx.journalEntry.findUniqueOrThrow({
      where: { id: current.id },
      include: { lines: true },
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "JOURNAL_ENTRY_NOT_FOUND") {
      return null;
    }
    if (error instanceof Error && error.message === "JOURNAL_ENTRY_NOT_EDITABLE") {
      return null;
    }
    throw error;
  });

  if (!entry) {
    const latest = await getOwnedJournalEntryById(organizationId, journalEntryId);
    if (!latest) return { ok: false, error: "Journal entry not found." };
    return { ok: false, error: `A ${latest.status} journal entry cannot be edited.` };
  }

  return { ok: true, entry };
}


// ------------------------------
// Draft line reordering (Phase 4A-4A)
// ------------------------------

export type JournalLineMoveDirection = "UP" | "DOWN";

/**
 * Moves one persisted journal line within a DRAFT entry without deleting or
 * recreating the line. The two affected rows exchange their lineNumber
 * values inside one transaction, so the JournalEntryLine ids remain stable.
 * The transaction also re-checks organization/company ownership and DRAFT
 * status so a stale UI cannot mutate a POSTED/VOID entry.
 */
export async function reorderJournalEntryLine(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  journalEntryLineId: string,
  direction: JournalLineMoveDirection,
  userId?: string
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) return { ok: false, error: "Journal entry not found." };
  if (existing.status === "POSTED") return { ok: false, error: "Posted journal entries are locked." };
  if (existing.status === "VOID") return { ok: false, error: "Void journal entries cannot be modified." };

  const currentLine = existing.lines.find((line) => line.id === journalEntryLineId);
  if (!currentLine) return { ok: false, error: "Journal line not found." };

  const targetLineNumber = direction === "UP" ? currentLine.lineNumber - 1 : currentLine.lineNumber + 1;
  const targetLine = existing.lines.find((line) => line.lineNumber === targetLineNumber);
  if (!targetLine) {
    return { ok: false, error: direction === "UP" ? "This line is already first." : "This line is already last." };
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.journalEntry.findFirst({
      where: { id: journalEntryId, companyId, company: { organizationId } },
      select: { id: true, companyId: true, status: true, transactionCandidateId: true, aiSuggestionId: true },
    });

    if (!current || current.companyId !== companyId) throw new Error("JOURNAL_ENTRY_NOT_FOUND");
    if (current.status === "POSTED") throw new Error("JOURNAL_ENTRY_POSTED");
    if (current.status === "VOID") throw new Error("JOURNAL_ENTRY_VOID");
    if (current.status !== "DRAFT") throw new Error("JOURNAL_ENTRY_NOT_EDITABLE");

    const lines = await tx.journalEntryLine.findMany({
      where: { journalEntryId: current.id },
      select: { id: true, lineNumber: true },
      orderBy: { lineNumber: "asc" },
    });
    const index = lines.findIndex((line) => line.id === journalEntryLineId);
    if (index === -1) throw new Error("JOURNAL_LINE_NOT_FOUND");

    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lines.length) throw new Error("JOURNAL_LINE_AT_BOUNDARY");

    const currentDbLine = lines[index];
    const targetDbLine = lines[targetIndex];

    // No unique constraint exists on lineNumber, but a temporary value keeps
    // the swap safe even if a future schema adds one.
    await tx.journalEntryLine.update({
      where: { id: currentDbLine.id },
      data: { lineNumber: 0 },
    });
    await tx.journalEntryLine.update({
      where: { id: targetDbLine.id },
      data: { lineNumber: currentDbLine.lineNumber },
    });
    await tx.journalEntryLine.update({
      where: { id: currentDbLine.id },
      data: { lineNumber: targetDbLine.lineNumber },
    });

    // Normalize every line number from the persisted order. This guarantees
    // 1..N with no gaps or duplicates even if older data was inconsistent.
    const normalized = await tx.journalEntryLine.findMany({
      where: { journalEntryId: current.id },
      select: { id: true },
      orderBy: { lineNumber: "asc" },
    });
    for (let i = 0; i < normalized.length; i += 1) {
      await tx.journalEntryLine.update({ where: { id: normalized[i].id }, data: { lineNumber: i + 1 } });
    }

    if (current.transactionCandidateId && userId) {
      const review = await tx.aIReviewRecord.findUnique({
        where: { candidateId: current.transactionCandidateId },
        select: { humanReviewStatus: true },
      });

      if (review) {
        await tx.aIReviewRecord.update({
          where: { candidateId: current.transactionCandidateId },
          data: {
            humanReviewStatus: "NEEDS_CORRECTION",
            reviewedById: userId,
            reviewedAt: new Date(),
          },
        });

        await tx.aIReviewAudit.create({
          data: {
            candidateId: current.transactionCandidateId,
            suggestionId: current.aiSuggestionId,
            action: "EDITED",
            userId,
            previousHumanReviewStatus: review.humanReviewStatus,
            newHumanReviewStatus: "NEEDS_CORRECTION",
            relevantCorrection: "Draft Journal Entry line order changed by human; reconciliation must be re-checked.",
            journalEntryId: current.id,
          },
        });
      }
    }

    return tx.journalEntry.findUniqueOrThrow({
      where: { id: current.id },
      include: { lines: true },
    });
  }).catch((error: unknown) => {
    if (!(error instanceof Error)) throw error;
    const messages: Record<string, string> = {
      JOURNAL_ENTRY_NOT_FOUND: "Journal entry not found.",
      JOURNAL_ENTRY_POSTED: "Posted journal entries are locked.",
      JOURNAL_ENTRY_VOID: "Void journal entries cannot be modified.",
      JOURNAL_ENTRY_NOT_EDITABLE: "Only DRAFT journal entries can be reordered.",
      JOURNAL_LINE_NOT_FOUND: "Journal line not found.",
      JOURNAL_LINE_AT_BOUNDARY: direction === "UP" ? "This line is already first." : "This line is already last.",
    };
    if (messages[error.message]) return null;
    throw error;
  });

  if (!result) {
    const latest = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
    if (!latest) return { ok: false, error: "Journal entry not found." };
    if (latest.status === "POSTED") return { ok: false, error: "Posted journal entries are locked." };
    if (latest.status === "VOID") return { ok: false, error: "Void journal entries cannot be modified." };
    return { ok: false, error: "The journal line could not be reordered." };
  }

  return { ok: true, entry: result };
}

// ------------------------------
// Human review status transitions (Phase 4B-8). These are review gates;
// POSTED remains a separate existing lifecycle state and no posting side
// effects are introduced here.
// ------------------------------

const ALLOWED_STATUS_TRANSITIONS: Record<JournalEntry["status"], JournalEntry["status"][]> = {
  DRAFT: ["IN_REVIEW", "VOID"],
  IN_REVIEW: ["DRAFT", "READY_FOR_POSTING"],
  READY_FOR_POSTING: ["DRAFT"],
  POSTED: [],
  VOID: [],
};

/**
 * Transitions a journal entry's lifecycle status while enforcing the single
 * server-side state machine. Review states never create ledger records.
 */
export async function setJournalEntryStatus(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  nextStatus: JournalEntry["status"]
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) {
    return { ok: false, error: "Journal entry not found." };
  }

  if (!ALLOWED_STATUS_TRANSITIONS[existing.status].includes(nextStatus)) {
    return {
      ok: false,
      error: `Cannot change a ${existing.status} entry to ${nextStatus}.`,
    };
  }

  const entry = await prisma.journalEntry.update({
    where: { id: existing.id },
    data: { status: nextStatus },
    include: { lines: true },
  });
  return { ok: true, entry };
}

export async function sendJournalEntryForReview(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  userId: string
): Promise<JournalEntryResult & { validationErrors?: string[] }> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) return { ok: false, error: "Journal entry not found." };
  if (existing.status !== "DRAFT") {
    return { ok: false, error: `Only DRAFT journal entries can be sent for review.` };
  }

  const validation = await validateJournalEntryForReview(organizationId, journalEntryId);
  if (!validation.valid) {
    return { ok: false, error: validation.errors.join(" "), validationErrors: validation.errors };
  }

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.journalEntry.update({
      where: { id: existing.id },
      data: { status: "IN_REVIEW" },
      include: { lines: true },
    });

    await tx.aIReviewAudit.create({
      data: {
        candidateId: existing.transactionCandidateId,
        suggestionId: existing.aiSuggestionId,
        action: "JOURNAL_SENT_FOR_REVIEW",
        userId,
        journalEntryId: existing.id,
        relevantCorrection: "Journal Entry passed accounting validation and was sent for human review.",
      },
    });

    return updated;
  });

  return { ok: true, entry };
}

export async function markJournalEntryReadyForPosting(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  userId: string
): Promise<JournalEntryResult & { validationErrors?: string[] }> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) return { ok: false, error: "Journal entry not found." };
  if (existing.status !== "IN_REVIEW") {
    return { ok: false, error: "Only journal entries in review can be marked ready for posting." };
  }

  const validation = await validateJournalEntryForReview(organizationId, journalEntryId);
  if (!validation.valid) {
    return { ok: false, error: validation.errors.join(" "), validationErrors: validation.errors };
  }

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.journalEntry.update({
      where: { id: existing.id },
      data: { status: "READY_FOR_POSTING" },
      include: { lines: true },
    });

    await tx.aIReviewAudit.create({
      data: {
        candidateId: existing.transactionCandidateId,
        suggestionId: existing.aiSuggestionId,
        action: "JOURNAL_MARKED_READY",
        userId,
        journalEntryId: existing.id,
        relevantCorrection: "Human review completed; journal entry passed all accounting validation rules.",
      },
    });

    return updated;
  });

  return { ok: true, entry };
}

export async function returnJournalEntryToDraft(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  userId: string
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) return { ok: false, error: "Journal entry not found." };
  if (existing.status !== "IN_REVIEW" && existing.status !== "READY_FOR_POSTING") {
    return { ok: false, error: "Only entries in review or ready for posting can be returned to Draft." };
  }

  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.journalEntry.update({
      where: { id: existing.id },
      data: { status: "DRAFT" },
      include: { lines: true },
    });

    await tx.aIReviewAudit.create({
      data: {
        candidateId: existing.transactionCandidateId,
        suggestionId: existing.aiSuggestionId,
        action: "JOURNAL_RETURNED_TO_DRAFT",
        userId,
        journalEntryId: existing.id,
        relevantCorrection: `Journal Entry returned from ${existing.status} to DRAFT for further correction.`,
      },
    });

    return updated;
  });

  return { ok: true, entry };
}

export async function postJournalEntry(
  organizationId: string,
  companyId: string,
  journalEntryId: string,
  userId: string
): Promise<JournalEntryResult> {
  const current = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!current) return { ok: false, error: "Journal entry not found." };
  if (current.status === "POSTED") {
    return { ok: false, error: "Journal Entry has already been posted." };
  }
  if (current.status !== "READY_FOR_POSTING") {
    return { ok: false, error: "Only READY_FOR_POSTING entries can be posted." };
  }

  // Reuse the existing server-side posting/readiness validators for the
  // immediate preflight check. The transaction below repeats the checks
  // against its own snapshot so the browser can never race a validation
  // result into a partial post.
  const readyCheck = await validateReadyForPostingJournalEntry(organizationId, companyId, journalEntryId);
  if (!readyCheck.valid) {
    return { ok: false, error: readyCheck.errors.join(" ") };
  }
  const postingValidation = await validateJournalEntryForPosting(organizationId, journalEntryId);
  if (!postingValidation.ok) {
    return postingValidation;
  }

  try {
    const entry = await prisma.$transaction(async (tx) => {
      // Re-check the complete authenticated ownership chain inside the
      // posting transaction. Browser-supplied ids are never trusted.
      const membership = await tx.membership.findFirst({
        where: { userId, organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!membership) throw new Error("POSTING_ORGANIZATION_ACCESS");

      const company = await tx.company.findFirst({
        where: { id: companyId, organizationId },
        select: { id: true },
      });
      if (!company) throw new Error("POSTING_COMPANY_ACCESS");

      const current = await tx.journalEntry.findFirst({
        where: {
          id: journalEntryId,
          companyId: company.id,
          company: { organizationId },
        },
        include: {
          lines: { include: { account: true }, orderBy: { lineNumber: "asc" } },
          fiscalYear: true,
          accountingPeriod: true,
        },
      });

      if (!current) throw new Error("POSTING_ENTRY_NOT_FOUND");
      if (current.status === "POSTED") throw new Error("POSTING_ALREADY_POSTED");
      if (current.status !== "READY_FOR_POSTING") throw new Error("POSTING_NOT_READY");

      const errors: string[] = [];

      // Re-check Fiscal Year -> Company and Period -> Fiscal Year -> Company.
      if (current.fiscalYear.companyId !== company.id) {
        errors.push("Fiscal year is not valid for this company.");
      }
      if (
        current.accountingPeriod.companyId !== company.id ||
        current.accountingPeriod.fiscalYearId !== current.fiscalYear.id
      ) {
        errors.push("Accounting period is not valid for this fiscal year and company.");
      }
      if (
        current.entryDate < current.accountingPeriod.startDate ||
        current.entryDate > current.accountingPeriod.endDate
      ) {
        errors.push("The entry date does not fall within the selected accounting period.");
      }
      if (current.fiscalYear.status !== "OPEN") {
        errors.push(`Fiscal year is ${current.fiscalYear.status.toLowerCase()}.`);
      }
      if (current.accountingPeriod.status !== "OPEN") {
        errors.push(`Accounting period is ${current.accountingPeriod.status.toLowerCase()}.`);
      }

      // Re-check every line -> Account -> Company and all posting invariants.
      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);
      let validLineCount = 0;

      for (const line of current.lines) {
        if (line.account.companyId !== company.id) {
          errors.push("One or more journal lines reference an account outside this company.");
          continue;
        }
        if (!line.account.isActive) {
          errors.push("One or more journal lines reference an inactive account.");
        }

        const debit = new Prisma.Decimal(line.debit);
        const credit = new Prisma.Decimal(line.credit);
        if (debit.isNegative() || credit.isNegative()) {
          errors.push("Journal line amounts cannot be negative.");
        }
        const debitSet = debit.gt(0);
        const creditSet = credit.gt(0);
        if (debitSet && creditSet) {
          errors.push("Debit and Credit cannot both contain values on a journal line.");
        }
        if (debitSet !== creditSet) validLineCount += 1;

        totalDebit = totalDebit.plus(debit);
        totalCredit = totalCredit.plus(credit);
      }

      if (validLineCount < 2) errors.push("At least two valid journal lines are required.");
      const difference = totalDebit.minus(totalCredit);
      if (!difference.isZero()) errors.push("Journal entry is not balanced.");

      if (errors.length > 0) {
        throw new Error(`POSTING_VALIDATION:${[...new Set(errors)].join(" ")}`);
      }

      // A READY_FOR_POSTING entry must never already have ledger projection
      // rows. Treat that state as an integrity failure rather than silently
      // creating duplicates. The unique database constraint is the final
      // backstop for concurrent/retried requests.
      const existingLedgerCount = await tx.generalLedgerEntry.count({
        where: { journalEntryId: current.id },
      });
      if (existingLedgerCount > 0) {
        throw new Error("POSTING_LEDGER_ALREADY_EXISTS");
      }

      // The status predicate makes posting idempotent under duplicate requests:
      // exactly one transaction can transition READY_FOR_POSTING -> POSTED.
      const updatedCount = await tx.journalEntry.updateMany({
        where: {
          id: current.id,
          companyId: company.id,
          status: "READY_FOR_POSTING",
          accountingPeriod: { status: "OPEN", fiscalYearId: current.fiscalYear.id, companyId: company.id },
          fiscalYear: { status: "OPEN", companyId: company.id },
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedByUserId: userId,
        },
      });

      if (updatedCount.count !== 1) {
        const latest = await tx.journalEntry.findUnique({
          where: { id: current.id },
          select: { status: true },
        });
        if (latest?.status === "POSTED") throw new Error("POSTING_ALREADY_POSTED");
        throw new Error("POSTING_CONCURRENT_CHANGE");
      }

      await tx.generalLedgerEntry.createMany({
        data: current.lines.map((line) => ({
          organizationId,
          companyId: company.id,
          journalEntryId: current.id,
          journalEntryLineId: line.id,
          accountId: line.accountId,
          fiscalYearId: current.fiscalYearId,
          accountingPeriodId: current.accountingPeriodId,
          entryDate: current.entryDate,
          description: line.description ?? current.description,
          reference: line.reference ?? current.reference,
          debit: line.debit,
          credit: line.credit,
        })),
      });

      await tx.aIReviewAudit.create({
        data: {
          candidateId: current.transactionCandidateId,
          suggestionId: current.aiSuggestionId,
          action: "JOURNAL_POSTED",
          userId,
          journalEntryId: current.id,
          relevantCorrection: "Journal Entry status transitioned from READY_FOR_POSTING to POSTED.",
        },
      });

      return tx.journalEntry.findUniqueOrThrow({
        where: { id: current.id },
        include: { lines: { orderBy: { lineNumber: "asc" } } },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return { ok: true, entry };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "POSTING_ALREADY_POSTED") {
        return { ok: false, error: "Journal Entry has already been posted." };
      }
      if (error.message === "POSTING_ENTRY_NOT_FOUND" || error.message === "POSTING_COMPANY_ACCESS") {
        return { ok: false, error: "Journal entry not found." };
      }
      if (error.message === "POSTING_ORGANIZATION_ACCESS") {
        return { ok: false, error: "You no longer have access to this organization." };
      }
      if (error.message === "POSTING_NOT_READY") {
        return { ok: false, error: "Only READY_FOR_POSTING entries can be posted." };
      }
      if (error.message === "POSTING_LEDGER_ALREADY_EXISTS") {
        return { ok: false, error: "General Ledger records already exist for this Journal Entry. Posting was not completed." };
      }
      if (error.message.startsWith("POSTING_VALIDATION:")) {
        return { ok: false, error: error.message.slice("POSTING_VALIDATION:".length) };
      }
      // A concurrent serializable transaction may abort after the first
      // request commits. Resolve the final state before returning an error.
      const latest = await prisma.journalEntry.findFirst({
        where: { id: journalEntryId, companyId, company: { organizationId } },
        select: { status: true },
      });
      if (latest?.status === "POSTED") {
        return { ok: false, error: "Journal Entry has already been posted." };
      }
    }
    return { ok: false, error: "Journal Entry could not be posted. No changes were saved." };
  }
}
export const voidJournalEntry = (organizationId: string, companyId: string, journalEntryId: string) =>
  setJournalEntryStatus(organizationId, companyId, journalEntryId, "VOID");

/**
 * Hard-deletes a journal entry outright. Only ever allowed for DRAFT
 * entries (spec section 14: "Do NOT permanently delete POSTED journal
 * entries") — POSTED or VOID entries must be handled via
 * setJournalEntryStatus instead. Lines cascade automatically (see the
 * schema's onDelete: Cascade on JournalEntryLine.journalEntry).
 */
export async function deleteJournalEntry(
  organizationId: string,
  companyId: string,
  journalEntryId: string
): Promise<JournalEntryResult> {
  const existing = await getOwnedJournalEntry(organizationId, companyId, journalEntryId);
  if (!existing) {
    return { ok: false, error: "Journal entry not found." };
  }
  if (existing.status === "POSTED") {
    return { ok: false, error: "Posted journal entries cannot be deleted." };
  }
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "Only DRAFT entries can be deleted. Void this entry instead." };
  }

  await prisma.journalEntry.delete({ where: { id: existing.id } });
  return { ok: true, entry: existing };
}
