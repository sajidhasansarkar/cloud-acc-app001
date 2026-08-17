"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageJournalEntries } from "@/lib/rbac";
import { createJournalEntrySchema, updateJournalEntrySchema } from "@/lib/validations";
import {
  createJournalEntry,
  getJournalEntry,
  listJournalEntries,
  postJournalEntry,
  voidJournalEntry,
  deleteJournalEntry,
  type JournalEntryResult,
} from "@/accounting/journal-entries";
import type { JournalEntry, JournalEntryLine, JournalEntrySourceType } from "@prisma/client";

/**
 * Auth/validation entry points a future Journal Entry UI (Phase 4A-3) will
 * call. Each one: requires a signed-in user + active organization, checks
 * the role can manage journal entries, validates input with zod, then
 * delegates to src/accounting/journal-entries.ts — which re-checks
 * ownership itself rather than trusting this layer alone. Same shape as
 * src/actions/account-mappings.ts / src/actions/tax-codes.ts.
 *
 * There is deliberately no "update" or "post" UI wiring beyond the status
 * action below — this phase is database foundation only (spec section 17:
 * no Journal Entry UI / new-entry form yet).
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
  filters?: { status?: JournalEntry["status"]; accountingPeriodId?: string; fiscalYearId?: string }
): Promise<(JournalEntry & { lines: JournalEntryLine[] })[] | null> {
  const { organization } = await requireActiveOrganization();
  return listJournalEntries(organization.id, companyId, filters);
}

export async function getJournalEntryAction(companyId: string, journalEntryId: string) {
  const { organization } = await requireActiveOrganization();
  return getJournalEntry(organization.id, companyId, journalEntryId);
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
