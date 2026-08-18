"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { canManageJournalEntries } from "@/lib/rbac";
import {
  createDraftJournalEntryFromSuggestion,
  type CreateDraftFromSuggestionResult,
} from "@/accounting/journal-entry-drafts";

/**
 * Phase 4B-6 server action: "Create Draft Journal Entry" on a reviewed
 * transaction. Requires the same permission as manually creating a Journal
 * Entry (spec section 2/16) — accepting an AI suggestion (canReviewAI) is a
 * separate, narrower capability from actually creating the resulting
 * Journal Entry.
 */
export async function createDraftJournalEntryFromSuggestionAction(
  companyId: string,
  documentId: string,
  candidateId: string,
  confirmedDate?: string
): Promise<CreateDraftFromSuggestionResult> {
  const { role, user, organization } = await requireActiveOrganization();

  if (!canManageJournalEntries(role)) {
    return {
      ok: false,
      error: "You don't have permission to manage journal entries.",
      code: "VALIDATION_ERROR",
    };
  }

  const result = await createDraftJournalEntryFromSuggestion(organization.id, user.id, {
    companyId,
    documentId,
    candidateId,
    confirmedDate,
  });

  if (result.ok) {
    revalidatePath(`/companies/${companyId}/documents/${documentId}`);
    revalidatePath(`/companies/${companyId}/journal-entries`);
    revalidatePath(`/companies/${companyId}/journal-entries/${result.entry.id}`);
  }

  return result;
}
