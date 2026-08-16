import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CompanyForm } from "@/components/companies/company-form";
import { canManageCompanies } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { INITIAL_COUNTRIES } from "@/lib/constants";

export const metadata = { title: "Create Company — Ledger" };

export default async function NewCompanyPage() {
  const { role } = await requireActiveOrganization();
  if (!canManageCompanies(role)) {
    redirect("/dashboard/companies");
  }

  const dbCountries = await prisma.countryConfiguration.findMany({
    where: { isActive: true },
    orderBy: { countryName: "asc" },
    select: { countryCode: true, countryName: true, currencyCode: true, currencySymbol: true },
  });

  // Falls back to the built-in list if CountryConfiguration hasn't been
  // seeded yet, so the form is never empty. The database remains the
  // source of truth and is extendable by an admin without a code change.
  const countries = dbCountries.length > 0 ? dbCountries : [...INITIAL_COUNTRIES];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/companies"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to companies
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink-900">Create Company</h1>
        <p className="text-sm text-ink-500">Add a new client company to your organization.</p>
      </div>

      <div className="rounded-lg border border-ink-100 bg-white p-6 shadow-card">
        <CompanyForm mode="create" countries={countries} onCancelHref="/dashboard/companies" />
      </div>
    </div>
  );
}
