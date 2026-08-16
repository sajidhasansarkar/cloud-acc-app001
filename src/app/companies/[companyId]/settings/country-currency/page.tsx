import Link from "next/link";
import { requireOwnedCompany } from "@/lib/company-guard";
import { prisma } from "@/lib/prisma";
import { SettingsTabs } from "@/components/companies/settings-tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata = { title: "Country & Currency Settings — Ledger" };

export default async function CompanyCountryCurrencySettingsPage({
  params,
}: {
  params: { companyId: string };
}) {
  // Security gate: Authenticated User -> Organization -> Company, re-derived
  // here rather than trusted from the URL.
  const company = await requireOwnedCompany(params.companyId);

  // Reuses the CountryConfiguration relation created in Phase 2A — no
  // second country/currency configuration system. If the linked
  // configuration was ever deactivated/removed, company.country and
  // company.currency (the plain ISO codes stored directly on the Company
  // row) still display, per the Phase 2A design note in schema.prisma.
  const countryConfiguration = company.countryConfigurationId
    ? await prisma.countryConfiguration.findUnique({
        where: { id: company.countryConfigurationId },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Company Settings</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>

      <SettingsTabs companyId={company.id} />

      <Card>
        <CardHeader>
          <CardTitle>Country & Currency</CardTitle>
          <CardDescription>
            Sourced from the country configuration selected for {company.displayName}. To change
            the country, use the{" "}
            <Link href={`/companies/${company.id}/settings/general`} className="text-ledger-600 hover:underline">
              General tab
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Country" value={countryConfiguration?.countryName ?? "—"} />
            <Field label="Country Code" value={company.country} mono />
            <Field
              label="Currency"
              value={
                countryConfiguration
                  ? `${countryConfiguration.currencySymbol} ${countryConfiguration.currencyCode}`
                  : company.currency
              }
            />
            <Field label="Currency Code" value={company.currency} mono />
            <Field label="Currency Symbol" value={countryConfiguration?.currencySymbol ?? "—"} />
          </dl>

          {!countryConfiguration ? (
            <p className="mt-4 text-xs text-ink-500">
              This company&apos;s original country configuration is no longer available. Country
              and currency codes above are still stored on the company record itself.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className={`text-sm text-ink-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
