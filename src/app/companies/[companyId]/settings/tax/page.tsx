import { Suspense } from "react";
import { ReceiptText } from "lucide-react";
import type { TaxType } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listTaxCodesAction } from "@/actions/tax-codes";
import { canManageTaxCodes } from "@/lib/rbac";
import { TAX_TYPES, TAX_COUNTRIES, TAX_CODE_STATUSES } from "@/lib/constants";
import { serializeTaxCode } from "@/components/tax/types";
import { SettingsTabs } from "@/components/companies/settings-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TaxCodesTable } from "@/components/tax/tax-codes-table";
import { TaxCodesFilterBar } from "@/components/tax/tax-codes-filter-bar";
import { TaxCodeFormDialog } from "@/components/tax/tax-code-form-dialog";

export const metadata = { title: "Tax — Ledger" };

const COUNTRY_CODES: readonly string[] = TAX_COUNTRIES.map((c) => c.countryCode);

// Phase 3B-2: Tax Code management UI, built on Phase 3B-1's backend
// (src/tax/tax-codes.ts, src/actions/tax-codes.ts). All read/write access
// still goes through listTaxCodesAction / createTaxCodeAction / etc.,
// which re-derive Organization -> Company -> TaxCode ownership on every
// call — this page never trusts companyId or a taxCodeId from the browser
// on its own. The full, unfiltered list is fetched once for the company;
// tax type / country / status / search filters are all applied here, in-
// memory, over that already-scoped list (same reasoning as
// src/accounting/account-tree.ts for Chart of Accounts) — a crafted query
// string can never widen results beyond the caller's own company, and it
// lets the page tell "no tax codes at all" apart from "no tax codes match
// the current filters" without a second round trip.
//
// No tax engine, tax filing, AI tax decisions, account mapping, or journal
// entries here (see spec's "DO NOT IMPLEMENT" section) — this is data
// management for TaxCode records only.
export default async function CompanyTaxSettingsPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { q?: string; taxType?: string; country?: string; status?: string };
}) {
  const { role } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageTaxCodes(role);

  const allTaxCodes = (await listTaxCodesAction(company.id)) ?? [];

  const taxType = searchParams.taxType && (TAX_TYPES as readonly string[]).includes(searchParams.taxType)
    ? (searchParams.taxType as TaxType)
    : undefined;
  const countryCode = searchParams.country && COUNTRY_CODES.includes(searchParams.country)
    ? searchParams.country
    : undefined;
  const status = searchParams.status && (TAX_CODE_STATUSES as readonly string[]).includes(searchParams.status)
    ? (searchParams.status as "ACTIVE" | "INACTIVE")
    : undefined;
  const q = searchParams.q?.trim().toLowerCase() || undefined;

  const filtered = allTaxCodes.filter((t) => {
    if (taxType && t.taxType !== taxType) return false;
    if (countryCode && t.countryCode !== countryCode) return false;
    if (status && (status === "ACTIVE") !== t.isActive) return false;
    if (q && !t.code.toLowerCase().includes(q) && !t.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const taxCodes = filtered.map(serializeTaxCode);
  const hasAnyTaxCodes = allTaxCodes.length > 0;
  const hasActiveFilters = Boolean(q || taxType || countryCode || status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Company Settings</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>

      <SettingsTabs companyId={company.id} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Tax Codes</h2>
          <p className="text-sm text-ink-500">
            Tax codes configured for {company.displayName}. Rates come from these records only.
          </p>
        </div>
        {canManage ? <TaxCodeFormDialog mode="create" companyId={company.id} /> : null}
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        {!hasAnyTaxCodes ? (
          <div className="p-4">
            <EmptyState
              icon={ReceiptText}
              title="No tax codes yet"
              description="Add your first tax code to start managing tax rates for this company."
              action={
                canManage ? (
                  <TaxCodeFormDialog
                    mode="create"
                    companyId={company.id}
                    triggerSize="sm"
                    triggerLabel="Add tax code"
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Suspense fallback={<div className="h-[104px] border-b border-ink-100" />}>
              <TaxCodesFilterBar />
            </Suspense>

            {taxCodes.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={ReceiptText}
                  title="No matching tax codes"
                  description={
                    hasActiveFilters
                      ? "Try a different search term or clear your filters."
                      : "No tax codes to show."
                  }
                />
              </div>
            ) : (
              <TaxCodesTable companyId={company.id} taxCodes={taxCodes} canManage={canManage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
