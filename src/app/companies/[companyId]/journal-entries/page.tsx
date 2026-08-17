import Link from "next/link";
import { BookText, Plus } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listJournalEntries } from "@/accounting/journal-entries";
import { canManageJournalEntries } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntriesTable } from "@/components/journal-entries/journal-entries-table";

export const metadata = { title: "Journal Entries — Ledger" };

// Phase 4A-2: basic Journal Entries list. Replaces the Phase 2B-2A
// placeholder now that a real Journal Entry UI exists (spec section 2).
export default async function CompanyJournalEntriesPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role, organization } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);

  const entries = (await listJournalEntries(organization.id, company.id)) ?? [];
  const canManage = canManageJournalEntries(role);
  const basePath = `/companies/${company.id}/journal-entries`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Journal Entries</h1>
          <p className="text-sm text-ink-500">
            Manual and automated journal entries for {company.displayName}.
          </p>
        </div>
        {canManage ? (
          <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" />
            New Journal Entry
          </Link>
        ) : null}
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        {entries.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BookText}
              title="No journal entries found."
              description="Create your first journal entry to get started."
              action={
                canManage ? (
                  <Link href={`${basePath}/new`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    <Plus className="h-4 w-4" />
                    New Journal Entry
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <JournalEntriesTable companyId={company.id} entries={entries} canManage={canManage} />
        )}
      </div>
    </div>
  );
}
