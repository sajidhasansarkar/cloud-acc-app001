import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JournalEntry, JournalEntryLine, JournalEntrySourceType } from "@prisma/client";
import {
  getOwnedCompany,
  getOwnedFiscalYear,
  getOwnedAccountingPeriod,
  getOwnedAccount,
  getOwnedJournalEntry,
} from "./access";

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
 *  - calculateEntryTotals / isEntryBalanced (spec section 9)
 */

export type JournalEntryResult =
  | { ok: true; entry: JournalEntry & { lines: JournalEntryLine[] } }
  | { ok: false; error: string };

export type JournalEntryLineInput = {
  accountId: string;
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
 * Validates one journal entry line in isolation:
 *  - debit / credit must each be >= 0 (spec section 8 — no negative
 *    amounts; a "negative" amount is represented by using the opposite
 *    column, not a negative number).
 *  - a line can't be zero on both sides (it wouldn't do anything), and
 *    can't have both a debit and a credit at once (a line is one side of
 *    one entry — standard double-entry shape).
 */
function validateLineAmounts(line: JournalEntryLineInput): { ok: true } | { ok: false; error: string } {
  const debit = new Prisma.Decimal(line.debit);
  const credit = new Prisma.Decimal(line.credit);

  if (debit.isNegative() || credit.isNegative()) {
    return { ok: false, error: "Debit and credit amounts cannot be negative." };
  }
  if (debit.isZero() && credit.isZero()) {
    return { ok: false, error: "Each line must have a debit or a credit amount greater than zero." };
  }
  if (!debit.isZero() && !credit.isZero()) {
    return { ok: false, error: "A single line cannot have both a debit and a credit amount." };
  }
  return { ok: true };
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
  // (spec section 5) before creating anything. Deduplicate ids so we
  // don't repeat the same ownership lookup for entries with many lines
  // against the same account.
  const uniqueAccountIds = [...new Set(input.lines.map((l) => l.accountId))];
  for (const accountId of uniqueAccountIds) {
    const account = await getOwnedAccount(organizationId, company.id, accountId);
    if (!account) {
      return { ok: false, error: "One or more lines reference an account outside this company." };
    }
  }

  for (const line of input.lines) {
    const lineCheck = validateLineAmounts(line);
    if (!lineCheck.ok) {
      return { ok: false, error: lineCheck.error };
    }
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
      createdById,
      lines: {
        create: input.lines.map((line, index) => ({
          accountId: line.accountId,
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
export async function listJournalEntries(
  organizationId: string,
  companyId: string,
  filters?: {
    status?: JournalEntry["status"];
    accountingPeriodId?: string;
    fiscalYearId?: string;
  }
) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;

  return prisma.journalEntry.findMany({
    where: {
      companyId: company.id,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.accountingPeriodId ? { accountingPeriodId: filters.accountingPeriodId } : {}),
      ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
    },
    // createdBy selects only { id, name } — never email/passwordHash
    // (spec section 12) — for the list's "Created By" column (Phase 4A-2).
    include: { lines: true, createdBy: { select: { id: true, name: true } } },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
  });
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
// Status transitions (spec sections 2, 14 — no complex posting logic yet)
// ------------------------------

const ALLOWED_STATUS_TRANSITIONS: Record<JournalEntry["status"], JournalEntry["status"][]> = {
  // DRAFT -> POSTED is intentionally allowed at the data layer today, but
  // this phase does not add any general-ledger side effect when it
  // happens (spec section 17) — it is just a status flip, ready for a
  // later phase to hang real posting logic off of.
  DRAFT: ["POSTED", "VOID"],
  POSTED: ["VOID"],
  VOID: [],
};

/**
 * Transitions a journal entry's status, enforcing the (intentionally
 * simple) state machine above. A POSTED entry is never hard-deleted or
 * moved back to DRAFT — the only way to reverse one is VOID (spec section
 * 14). VOID is terminal.
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

export const postJournalEntry = (organizationId: string, companyId: string, journalEntryId: string) =>
  setJournalEntryStatus(organizationId, companyId, journalEntryId, "POSTED");

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
  if (existing.status !== "DRAFT") {
    return { ok: false, error: "Only DRAFT entries can be deleted. Void this entry instead." };
  }

  await prisma.journalEntry.delete({ where: { id: existing.id } });
  return { ok: true, entry: existing };
}
