import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canManageJournalEntries } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getSmartImportReviewData } from "@/documents/smart-import";
import { EmptyState } from "@/components/ui/empty-state";
import { SmartImportReview } from "@/components/journal-entries/smart-import-review";

export const metadata = { title: "Reconcile Smart Import — Ledger" };

/**
 * The "Reconcile" screen: shows every transaction Smart Import staged for
 * this document, with the AI's proposed account per row (editable), so a
 * human can confirm before anything posts. Nothing on this screen has been
 * created as a Draft Journal Entry yet — that only happens once the human
 * clicks "Create Journal Entries" here.
 */
export default async function SmartImportReviewPage({
  params,
}: {
  params: { companyId: string; documentId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  if (!canManageJournalEntries(role)) {
    redirect(basePath);
  }

  const data = await getSmartImportReviewData(organization.id, company.id, params.documentId);

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`${basePath}/new`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to New Journal Entry
          </Link>
        </div>
        <EmptyState icon={ClipboardCheck} title="Import not found." description="This Smart Import document is unavailable for the selected company." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${basePath}/new`} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to New Journal Entry
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Reconcile Smart Import</h1>
        <p className="text-sm text-ink-500">
          {data.documentName} — review the proposed account for each transaction. Nothing is created until you confirm below.
        </p>
      </div>

      <SmartImportReview companyId={company.id} documentId={params.documentId} data={data} />
    </div>
  );
}
