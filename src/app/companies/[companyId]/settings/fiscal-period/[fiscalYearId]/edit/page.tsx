import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { getOwnedFiscalYear } from "@/accounting/access";
import { canManageFiscalYears } from "@/lib/rbac";
import { FiscalYearForm } from "@/components/fiscal-years/fiscal-year-form";

export const metadata = { title: "Edit Fiscal Year — Ledger" };

export default async function EditFiscalYearPage({
  params,
}: {
  params: { companyId: string; fiscalYearId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/settings/fiscal-period`;

  const fiscalYear = await getOwnedFiscalYear(organization.id, company.id, params.fiscalYearId);
  if (!fiscalYear) {
    notFound();
  }

  if (!canManageFiscalYears(role)) {
    redirect(`${basePath}/${fiscalYear.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`${basePath}/${fiscalYear.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {fiscalYear.name}
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Edit Fiscal Year</h1>
        <p className="text-sm text-ink-500">
          Update {fiscalYear.name}&apos;s dates for {company.displayName}.
        </p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <FiscalYearForm
          mode="edit"
          companyId={company.id}
          fiscalYear={{
            id: fiscalYear.id,
            name: fiscalYear.name,
            startDate: fiscalYear.startDate,
            endDate: fiscalYear.endDate,
          }}
          cancelHref={`${basePath}/${fiscalYear.id}`}
        />
      </div>
    </div>
  );
}
