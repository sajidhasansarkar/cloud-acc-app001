import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ListChecks } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getJournalEntry, calculateEntryTotals } from "@/accounting/journal-entries";
import { canManageJournalEntries } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JournalEntryStatusBadge } from "@/components/journal-entries/journal-entry-status-badge";
import { JOURNAL_ENTRY_SOURCE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { JournalEntrySourceType } from "@prisma/client";

export const metadata = { title: "Journal Entry — Ledger" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-sm font-medium text-ink-900">{value || "—"}</p>
    </div>
  );
}

export default async function JournalEntryDetailPage({
  params,
}: {
  params: { companyId: string; entryId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  // Ownership chain re-verified here too: entryId from the URL must belong
  // to companyId, which must belong to the caller's organization. A bad
  // or cross-company/cross-organization id 404s rather than leaking
  // whether the id exists elsewhere.
  const entry = await getJournalEntry(organization.id, company.id, params.entryId);
  if (!entry) {
    notFound();
  }

  const canManage = canManageJournalEntries(role);
  // Reuses the same Decimal-based summation the create/update paths use
  // (spec section 8 — no floating-point math), just to display totals;
  // this is not the balance validation deferred to a later phase (spec
  // section 17 — no posting/balance gate is applied here).
  const { totalDebit, totalCredit } = calculateEntryTotals(entry.lines);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to journal entries
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">{entry.entryNumber}</h1>
            <JournalEntryStatusBadge status={entry.status} />
          </div>
          <p className="text-sm text-ink-500">{company.displayName}</p>
        </div>

        {canManage && entry.status === "DRAFT" ? (
          <Link href={`${basePath}/${entry.id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entry Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Entry Number" value={entry.entryNumber} />
          <Field label="Entry Date" value={formatDate(entry.entryDate)} />
          <Field label="Fiscal Year" value={entry.fiscalYear.name} />
          <Field label="Accounting Period" value={entry.accountingPeriod.name} />
          <Field label="Reference" value={entry.reference} />
          <Field
            label="Source Type"
            value={JOURNAL_ENTRY_SOURCE_TYPE_LABELS[entry.sourceType as JournalEntrySourceType]}
          />
          <Field label="Description" value={entry.description} />
          <Field label="Label" value={entry.label} />
          <Field label="Created By" value={entry.createdBy?.name} />
          <Field label="Created Date" value={formatDate(entry.createdAt)} />
          <Field label="Updated Date" value={formatDate(entry.updatedAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal Lines</CardTitle>
          <CardDescription>Balance and posting validation are added in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          {entry.lines.length === 0 ? (
            <EmptyState icon={ListChecks} title="No journal lines added." />
          ) : (
            <div className="rounded-lg border border-ink-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.lines.map((line, index) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-ink-500">{index + 1}</TableCell>
                      <TableCell className="text-ink-800">
                        <span className="font-mono text-xs text-ink-500">{line.account.code}</span>
                        {" — "}
                        {line.account.name}
                      </TableCell>
                      <TableCell className="text-ink-700">{line.description || "—"}</TableCell>
                      <TableCell className="text-ink-700">{line.reference || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-ink-800">
                        {Number(line.debit) > 0 ? line.debit.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-ink-800">
                        {Number(line.credit) > 0 ? line.credit.toFixed(2) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-end gap-6 border-t border-ink-100 bg-surface-muted px-4 py-2 text-sm">
                <span className="text-ink-500">
                  Total Debit: <span className="font-mono text-ink-800">{totalDebit.toFixed(2)}</span>
                </span>
                <span className="text-ink-500">
                  Total Credit: <span className="font-mono text-ink-800">{totalCredit.toFixed(2)}</span>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
