import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getJournalEntry } from "@/accounting/journal-entries";
import { listFiscalYears } from "@/accounting/fiscal-years";
import { listAccountingPeriods } from "@/accounting/accounting-periods";
import { listAccounts } from "@/accounting/accounts";
import { listTaxCodes } from "@/tax/tax-codes";
import { canManageJournalEntries } from "@/lib/rbac";
import { JournalEntryForm } from "@/components/journal-entries/journal-entry-form";
import type { JournalLineDraft } from "@/components/journal-entries/journal-lines-editor";

export const metadata = { title: "Edit Journal Entry — Ledger" };

export default async function EditJournalEntryPage({
  params,
}: {
  params: { companyId: string; entryId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  // Ownership chain re-verified here too: entryId from the URL must belong
  // to companyId, which must belong to the caller's organization.
  const entry = await getJournalEntry(organization.id, company.id, params.entryId);
  if (!entry) {
    notFound();
  }

  const detailPath = `${basePath}/${entry.id}`;

  if (!canManageJournalEntries(role)) {
    redirect(detailPath);
  }

  // Only DRAFT entries are editable (spec section 10) — POSTED entries
  // can't be edited, and VOID entries aren't treated as normal editable
  // entries either. Both redirect back to the read-only detail view
  // rather than rendering a form that would just fail on submit.
  if (entry.status !== "DRAFT") {
    redirect(detailPath);
  }

  const [fiscalYearsResult, initialPeriodsResult, accountsResult, taxCodesResult] = await Promise.all([
    listFiscalYears(organization.id, company.id),
    listAccountingPeriods(organization.id, company.id, entry.fiscalYearId),
    listAccounts(organization.id, company.id),
    listTaxCodes(organization.id, company.id, { isActive: true }),
  ]);
  const fiscalYears = fiscalYearsResult ?? [];
  const initialPeriods = initialPeriodsResult ?? [];
  const accounts = accountsResult ?? [];
  const taxCodes = (taxCodesResult ?? []).map((tax) => ({ id: tax.id, code: tax.code, name: tax.name, isActive: tax.isActive }));

  // Existing lines converted to editor drafts: debit/credit stay as
  // strings (never parsed to a JS float — see JournalLinesEditor), and
  // whichever side is zero is shown as an empty field rather than "0" so
  // the debit/credit UI rule (spec section 9) reads the line the same
  // way a freshly-added line would.
  const initialLines: JournalLineDraft[] = entry.lines.map((line) => ({
    key: line.id,
    lineId: line.id,
    accountId: line.accountId,
    taxCodeId: line.taxCodeId ?? "",
    description: line.description ?? "",
    accountSource: line.accountSource,
    descriptionSource: line.descriptionSource,
    debitSource: line.debitSource,
    creditSource: line.creditSource,
    taxCodeSource: line.taxCodeSource,
    referenceSource: line.referenceSource,
    reference: line.reference ?? "",
    debit: line.debit.gt(0) ? line.debit.toString() : "",
    credit: line.credit.gt(0) ? line.credit.toString() : "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={detailPath}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {entry.entryNumber}
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Edit Journal Entry</h1>
        <p className="text-sm text-ink-500">
          Update {entry.entryNumber} for {company.displayName}.
        </p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <JournalEntryForm
          mode="edit"
          companyId={company.id}
          fiscalYears={fiscalYears}
          initialPeriods={initialPeriods}
          entry={{
            id: entry.id,
            entryNumber: entry.entryNumber,
            entryDate: entry.entryDate,
            fiscalYearId: entry.fiscalYearId,
            accountingPeriodId: entry.accountingPeriodId,
            reference: entry.reference,
            description: entry.description,
            label: entry.label,
            sourceType: entry.sourceType,
            version: entry.version,
          }}
          cancelHref={detailPath}
          accounts={accounts}
          taxCodes={taxCodes}
          initialLines={initialLines}
        />
      </div>
    </div>
  );
}
