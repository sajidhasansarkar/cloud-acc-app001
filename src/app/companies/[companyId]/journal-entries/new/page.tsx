import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listFiscalYears, getCurrentFiscalYear } from "@/accounting/fiscal-years";
import { listAccountingPeriods, getCurrentAccountingPeriod } from "@/accounting/accounting-periods";
import { listAccounts } from "@/accounting/accounts";
import { listTaxCodes } from "@/tax/tax-codes";
import { canManageJournalEntries } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntryForm } from "@/components/journal-entries/journal-entry-form";
import { JournalEntryCreateTabs } from "@/components/journal-entries/journal-entry-create-tabs";
import { SmartImportPanel } from "@/components/journal-entries/smart-import-panel";
import { DOCUMENT_STORAGE_PROVIDER } from "@/documents/config";

export const metadata = { title: "New Journal Entry — Ledger" };

export default async function NewJournalEntryPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  if (!canManageJournalEntries(role)) {
    redirect(basePath);
  }

  const fiscalYears = (await listFiscalYears(organization.id, company.id)) ?? [];

  // Journal entries can only reference existing fiscal years / accounting
  // periods (spec section 5/6 — this screen never creates one). If none
  // exist yet, point the user at Settings → Fiscal Period instead of
  // rendering a form with no valid options.
  if (fiscalYears.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to journal entries
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink-900">New Journal Entry</h1>
        </div>
        <EmptyState
          icon={CalendarRange}
          title="No fiscal years yet"
          description="Create a fiscal year and accounting periods before adding journal entries."
          action={
            <Link
              href={`/companies/${company.id}/settings/fiscal-period/new`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Create fiscal year
            </Link>
          }
        />
      </div>
    );
  }

  const [currentFiscalYear, currentPeriod, accounts, taxCodes] = await Promise.all([
    getCurrentFiscalYear(organization.id, company.id),
    getCurrentAccountingPeriod(organization.id, company.id),
    listAccounts(organization.id, company.id),
    listTaxCodes(organization.id, company.id, { isActive: true }),
  ]);

  const defaultFiscalYearId = currentFiscalYear?.id ?? fiscalYears[0].id;
  const initialPeriods = (await listAccountingPeriods(organization.id, company.id, defaultFiscalYearId)) ?? [];
  const defaultAccountingPeriodId =
    currentPeriod && currentPeriod.fiscalYearId === defaultFiscalYearId ? currentPeriod.id : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={basePath}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to journal entries
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">New Journal Entry</h1>
        <p className="text-sm text-ink-500">Create a draft journal entry for {company.displayName}.</p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <JournalEntryCreateTabs
          smartImport={<SmartImportPanel companyId={company.id} storageProvider={DOCUMENT_STORAGE_PROVIDER} />}
          manual={
            <JournalEntryForm
              mode="create"
              companyId={company.id}
              fiscalYears={fiscalYears}
              initialPeriods={initialPeriods}
              defaultFiscalYearId={defaultFiscalYearId}
              defaultAccountingPeriodId={defaultAccountingPeriodId}
              cancelHref={basePath}
              accounts={accounts ?? []}
              taxCodes={(taxCodes ?? []).map((tax) => ({ id: tax.id, code: tax.code, name: tax.name, isActive: tax.isActive }))}
            />
          }
        />
      </div>
    </div>
  );
}
