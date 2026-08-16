import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CompanyForm } from "@/components/companies/company-form";
import { canManageCompanies } from "@/lib/rbac";
import { INITIAL_COUNTRIES } from "@/lib/constants";

export const metadata = { title: "Edit Company — Ledger" };

export default async function EditCompanyPage({ params }: { params: { id: string } }) {
  const { role, organization } = await requireActiveOrganization();
  if (!canManageCompanies(role)) {
    redirect(`/dashboard/companies/${params.id}`);
  }

  // Scoped by organizationId — not just id — so a company belonging to
  // another organization 404s instead of leaking its data into the form.
  const company = await prisma.company.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });

  if (!company) {
    notFound();
  }

  const dbCountries = await prisma.countryConfiguration.findMany({
    where: { isActive: true },
    orderBy: { countryName: "asc" },
    select: { countryCode: true, countryName: true, currencyCode: true, currencySymbol: true },
  });
  const countries = dbCountries.length > 0 ? dbCountries : [...INITIAL_COUNTRIES];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/companies/${company.id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {company.displayName}
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Edit Company</h1>
        <p className="text-sm text-ink-500">Update {company.legalName}&apos;s details.</p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <CompanyForm
          mode="edit"
          companyId={company.id}
          countries={countries}
          onCancelHref={`/dashboard/companies/${company.id}`}
          defaultValues={{
            legalName: company.legalName,
            displayName: company.displayName,
            businessNumber: company.businessNumber ?? "",
            address: company.address ?? "",
            city: company.city ?? "",
            stateProvince: company.stateProvince ?? "",
            postalCode: company.postalCode ?? "",
            country: company.country,
            currency: company.currency,
            contactEmail: company.contactEmail ?? "",
            contactPhone: company.contactPhone ?? "",
            status: company.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
          }}
        />
      </div>
    </div>
  );
}
