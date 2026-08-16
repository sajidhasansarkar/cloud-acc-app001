import { requireOwnedCompany } from "@/lib/company-guard";
import { prisma } from "@/lib/prisma";
import { canManageCompanies } from "@/lib/rbac";
import { requireActiveOrganization } from "@/lib/session";
import { INITIAL_COUNTRIES } from "@/lib/constants";
import { SettingsTabs } from "@/components/companies/settings-tabs";
import { CompanyForm } from "@/components/companies/company-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = { title: "General Settings — Ledger" };

export default async function CompanyGeneralSettingsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role } = await requireActiveOrganization();
  // Security gate: Authenticated User -> Organization -> Company. companyId
  // comes straight from the URL and is re-verified here, same rule used by
  // every other route/action in this module — never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageCompanies(role);

  const dbCountries = await prisma.countryConfiguration.findMany({
    where: { isActive: true },
    orderBy: { countryName: "asc" },
    select: { countryCode: true, countryName: true, currencyCode: true, currencySymbol: true },
  });
  const countries = dbCountries.length > 0 ? dbCountries : [...INITIAL_COUNTRIES];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Company Settings</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>

      <SettingsTabs companyId={company.id} />

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Business information for {company.legalName}.</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <CompanyForm
              mode="edit"
              variant="settings"
              companyId={company.id}
              countries={countries}
              onCancelHref={`/companies/${company.id}/settings/general`}
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
          ) : (
            <p className="text-sm text-ink-500">
              You don&apos;t have permission to edit this company&apos;s settings.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
