"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageJournalEntries } from "@/lib/rbac";
import {
  createJournalEntrySchema,
  updateJournalEntryHeaderSchema,
  updateJournalEntryWithLinesSchema,
} from "@/lib/validations";
import {
  createJournalEntry,
  getJournalEntry,
  listJournalEntries,
  postJournalEntry,
  voidJournalEntry,
  deleteJournalEntry,
  reorderJournalEntryLine,
  updateJournalEntryHeader,
  updateJournalEntry,
  validateJournalEntryBalance,
  type JournalEntryResult,
  type ListJournalEntriesInput,
  type JournalEntryListResult,
  listJournalEntryLabels,
} from "@/accounting/journal-entries";
import type { JournalEntrySourceType } from "@prisma/client";

/**
 * Auth/validation entry points the Journal Entry UI calls. Each one:
 * requires a signed-in user + active organization, checks the role can
 * manage journal entries, validates input with zod, then delegates to
 * src/accounting/journal-entries.ts — which re-checks ownership itself
 * rather than trusting this layer alone. Same shape as
 * src/actions/account-mappings.ts / src/actions/tax-codes.ts.
 *
 * createJournalEntryAction is called by the New Journal Entry form,
 * including its journal lines (Phase 4A-3A — spec sections 1-13).
 * updateJournalEntryAction is the Edit Draft screen's write path: header
 * fields + journal lines together (Phase 4A-3A — spec section 15), DRAFT
 * entries only. updateJournalEntryHeaderAction (header fields only, no
 * lines) is kept from Phase 4A-2 for any caller that only needs to touch
 * header fields. Posting/void still have no UI wiring beyond the status
 * actions below.
 */

export async function createJournalEntryAction(input: {
  companyId: string;
  fiscalYearId: string;
  accountingPeriodId: string;
  entryNumber: string;
  entryDate: Date | string;
  reference?: string;
  description?: string;
  label?: string;
  sourceType?: JournalEntrySourceType;
  lines: {
    accountId: string;
    description?: string;
    reference?: string;
    debit: string | number;
    credit: string | number;
  }[];
}): Promise<JournalEntryResult> {
  const { role, organization, user } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const parsed = createJournalEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await createJournalEntry(organization.id, user.id, parsed.data);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
    revalidatePath(`/companies/${parsed.data.companyId}/journal-entries`);
  }

  return result;
}

export async function listJournalEntriesAction(
  companyId: string,
  filters: ListJournalEntriesInput = {}
): Promise<JournalEntryListResult | null> {
  const { organization } = await requireActiveOrganization();
  return listJournalEntries(organization.id, companyId, filters);
}

export async function listJournalEntryLabelsAction(companyId: string): Promise<string[] | null> {
  const { organization } = await requireActiveOrganization();
  return listJournalEntryLabels(organization.id, companyId);
}

export async function getJournalEntryAction(companyId: string, journalEntryId: string) {
  const { organization } = await requireActiveOrganization();
  return getJournalEntry(organization.id, companyId, journalEntryId);
}

/**
 * Basic header editing (Phase 4A-2 — spec section 10). Only DRAFT entries
 * can be edited; updateJournalEntryHeader itself re-checks this rather
 * than trusting the UI to only ever call it from the edit screen.
 */
export async function updateJournalEntryHeaderAction(
  journalEntryId: string,
  input: {
    companyId: string;
    fiscalYearId: string;
    accountingPeriodId: string;
    entryDate: Date | string;
    reference?: string;
    description?: string;
    label?: string;
    sourceType?: JournalEntrySourceType;
  }
): Promise<JournalEntryResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const parsed = updateJournalEntryHeaderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateJournalEntryHeader(
    organization.id,
    parsed.data.companyId,
    journalEntryId,
    parsed.data
  );

  if (result.ok) {
    revalidatePath(`/companies/${parsed.data.companyId}/journal-entries`);
    revalidatePath(`/companies/${parsed.data.companyId}/journal-entries/${journalEntryId}`);
  }

  return result;
}

/**
 * Full Edit Draft write path (Phase 4A-3A, spec section 15): header
 * fields + journal lines (account, description, reference, debit,
 * credit) together, in one server round trip. Only DRAFT entries can be
 * edited; updateJournalEntry itself re-checks this rather than trusting
 * the UI to only ever call it from the edit screen.
 */
export async function updateJournalEntryAction(
  journalEntryId: string,
  input: {
    companyId: string;
    fiscalYearId: string;
    accountingPeriodId: string;
    entryDate: Date | string;
    reference?: string;
    description?: string;
    label?: string;
    sourceType?: JournalEntrySourceType;
    lines: {
      accountId: string;
      description?: string;
      reference?: string;
      debit: string | number;
      credit: string | number;
    }[];
  }
): Promise<JournalEntryResult> {
  const { role, user, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const parsed = updateJournalEntryWithLinesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await updateJournalEntry(organization.id, parsed.data.companyId, journalEntryId, parsed.data, user.id);

  if (result.ok) {
    revalidatePath(`/companies/${parsed.data.companyId}/journal-entries`);
    revalidatePath(`/companies/${parsed.data.companyId}/journal-entries/${journalEntryId}`);
  }

  return result;
}


export async function reorderJournalEntryLineAction(
  companyId: string,
  journalEntryId: string,
  journalEntryLineId: string,
  direction: "UP" | "DOWN"
): Promise<JournalEntryResult> {
  const { role, user, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  if (direction !== "UP" && direction !== "DOWN") {
    return { ok: false, error: "Invalid line movement." };
  }

  const result = await reorderJournalEntryLine(
    organization.id,
    companyId,
    journalEntryId,
    journalEntryLineId,
    direction,
    user.id
  );

  if (result.ok) {
    revalidatePath(`/companies/${companyId}/journal-entries`);
    revalidatePath(`/companies/${companyId}/journal-entries/${journalEntryId}`);
    revalidatePath(`/companies/${companyId}/journal-entries/${journalEntryId}/edit`);
  }

  return result;
}

export async function validateJournalEntryBalanceAction(companyId: string, journalEntryId: string) {
  const { organization } = await requireActiveOrganization();
  const entry = await getJournalEntry(organization.id, companyId, journalEntryId);
  if (!entry) {
    return { ok: false as const, error: "Journal entry not found." };
  }

  const balance = await validateJournalEntryBalance(journalEntryId);
  return {
    ok: true as const,
    balanced: balance.balanced,
    totalDebit: balance.totalDebit.toFixed(4),
    totalCredit: balance.totalCredit.toFixed(4),
    difference: balance.difference.toFixed(4),
  };
}

export async function postJournalEntryAction(
  companyId: string,
  journalEntryId: string
): Promise<JournalEntryResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const result = await postJournalEntry(organization.id, companyId, journalEntryId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/companies/${companyId}/journal-entries`);
  }

  return result;
}

export async function voidJournalEntryAction(
  companyId: string,
  journalEntryId: string
): Promise<JournalEntryResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const result = await voidJournalEntry(organization.id, companyId, journalEntryId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/companies/${companyId}/journal-entries`);
  }

  return result;
}

export async function deleteJournalEntryAction(
  companyId: string,
  journalEntryId: string
): Promise<JournalEntryResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return { ok: false, error: "You don't have permission to manage journal entries." };
  }

  const result = await deleteJournalEntry(organization.id, companyId, journalEntryId);

  if (result.ok) {
    revalidatePath(`/dashboard/companies/${companyId}`);
    revalidatePath(`/companies/${companyId}/journal-entries`);
  }

  return result;
}
