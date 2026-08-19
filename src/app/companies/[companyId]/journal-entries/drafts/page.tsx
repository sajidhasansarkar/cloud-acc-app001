import Link from "next/link";
import { ArrowLeft, Plus, FileQuestion, FileClock } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getOwnedCompany } from "@/accounting/access";
import { validateDraftJournalEntry } from "@/accounting/journal-entries";
import { prisma } from "@/lib/prisma";
import { canManageJournalEntries } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntryStatusBadge } from "@/components/journal-entries/journal-entry-status-badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Draft Journal Entries — Ledger" };

export default async function DraftJournalEntriesPage({ params }: { params: { companyId: string } }) {
  const { organization, role } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const owned = await getOwnedCompany(organization.id, company.id);
  if (!owned) return <EmptyState icon={FileQuestion} title="Company not found" />;
  const drafts = await prisma.journalEntry.findMany({
    where: { companyId: company.id, status: "DRAFT" },
    include: { lines: true, sourceDocument: { select: { id: true, originalFileName: true } } },
    orderBy: [{ entryDate: "desc" }, { updatedAt: "desc" }],
  });
  const validations = await Promise.all(drafts.map(async (draft) => [draft.id, await validateDraftJournalEntry(organization.id, draft.id)] as const));
  const validationById = new Map(validations);
  const canManage = canManageJournalEntries(role);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/companies/${company.id}/journal-entries`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="h-3.5 w-3.5" />Back to journal entries</Link>
          <h1 className="font-display text-xl font-semibold text-ink-900">Draft Journal Entries</h1>
          <p className="text-sm text-ink-500">Editable proposed entries. Drafts are isolated from posted accounting data.</p>
        </div>
        {canManage ? <Link href={`/companies/${company.id}/journal-entries/new`} className={buttonVariants({ variant: "primary" })}><Plus className="h-4 w-4" />New Journal Entry</Link> : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card">
        {drafts.length === 0 ? <div className="p-5"><EmptyState icon={FileClock} title="No draft journal entries" description="Generate a draft from an approved transaction mapping or create one manually." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-ink-100 bg-surface-subtle"><tr>{["Date","Description","Reference","Source Document","Lines","Debit Total","Credit Total","Validation","Status","Last Updated"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-ink-500">{h}</th>)}</tr></thead><tbody>{drafts.map((draft) => { const validation = validationById.get(draft.id); return <tr key={draft.id} className="border-b border-ink-100 last:border-0"><td className="px-4 py-3">{formatDate(draft.entryDate)}</td><td className="px-4 py-3"><Link className="font-medium text-ink-900 hover:text-ledger-600" href={`/companies/${company.id}/journal-entries/${draft.id}`}>{draft.description || draft.entryNumber}</Link></td><td className="px-4 py-3 text-ink-500">{draft.reference || "—"}</td><td className="px-4 py-3 text-ink-500">{draft.sourceDocument ? draft.sourceDocument.originalFileName : "—"}</td><td className="px-4 py-3">{draft.lines.length}</td><td className="px-4 py-3 font-mono">{validation?.[1]?.totalDebit.toFixed(4) ?? "0.0000"}</td><td className="px-4 py-3 font-mono">{validation?.[1]?.totalCredit.toFixed(4) ?? "0.0000"}</td><td className="px-4 py-3 text-xs font-semibold">{validation?.[1]?.status.replaceAll("_", " ") ?? "NEEDS REVIEW"}{validation?.[1] && !validation[1].isBalanced ? <div className="font-normal text-negative">Difference {validation[1].difference.toFixed(4)}</div> : null}</td><td className="px-4 py-3"><JournalEntryStatusBadge status={draft.status} /></td><td className="px-4 py-3 text-ink-500">{formatDate(draft.updatedAt)}</td></tr>})}</tbody></table></div>}
      </div>
    </div>
  );
}
