import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canManageFiscalYears } from "@/lib/rbac";
import { FiscalYearForm } from "@/components/fiscal-years/fiscal-year-form";

export const metadata = { title: "Create Fiscal Year — Ledger" };

export default async function NewFiscalYearPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/settings/fiscal-period`;

  if (!canManageFiscalYears(role)) {
    redirect(basePath);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={basePath}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to fiscal periods
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Create Fiscal Year</h1>
        <p className="text-sm text-ink-500">Define a new fiscal year for {company.displayName}.</p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <FiscalYearForm mode="create" companyId={company.id} cancelHref={basePath} />
      </div>
    </div>
  );
}
