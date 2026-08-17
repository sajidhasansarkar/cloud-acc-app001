import { Suspense } from "react";
import { Map } from "lucide-react";
import type { MappingSourceType } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listAccountMappingsAction } from "@/actions/account-mappings";
import { listAccountsAction } from "@/actions/accounts";
import { listTaxCodesAction } from "@/actions/tax-codes";
import { canManageAccountMappings } from "@/lib/rbac";
import { MAPPING_SOURCE_TYPES, MAPPING_STATUSES } from "@/lib/constants";
import { SettingsTabs } from "@/components/companies/settings-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { MappingsTable } from "@/components/mapping/mappings-table";
import { MappingsFilterBar } from "@/components/mapping/mappings-filter-bar";
import { MappingFormDialog } from "@/components/mapping/mapping-form-dialog";

export const metadata = { title: "Account Mapping — Ledger" };

// Phase 3C-2: Account Mapping management UI, built on Phase 3C-1's
// backend (src/mapping/account-mappings.ts, src/actions/account-mappings.ts).
// All read/write access still goes through listAccountMappingsAction /
// createAccountMappingAction / etc., which re-derive Organization ->
// Company -> AccountMapping ownership on every call — this page never
// trusts companyId or a mappingId from the browser on its own. The full,
// unfiltered list is fetched once for the company; source type / account /
// tax code / status / search filters are all applied here, in-memory,
// over that already-scoped list (same reasoning as the Tax Codes settings
// page) — a crafted query string can never widen results beyond the
// caller's own company, and it lets the page tell "no mappings at all"
// apart from "no mappings match the current filters" without a second
// round trip.
//
// No automatic categorization, AI, bank import, journal entries, or
// reconciliation here (see spec's "DO NOT IMPLEMENT" section) — this is
// data management for AccountMapping records only.
export default async function CompanyAccountMappingSettingsPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { q?: string; sourceType?: string; accountId?: string; taxCodeId?: string; status?: string };
}) {
  const { role } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageAccountMappings(role);

  const [allMappings, allAccounts, allTaxCodes] = await Promise.all([
    listAccountMappingsAction(company.id).then((r) => r ?? []),
    listAccountsAction(company.id).then((r) => r ?? []),
    listTaxCodesAction(company.id).then((r) => r ?? []),
  ]);

  const accountOptions = allAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));
  const taxCodeOptions = allTaxCodes.map((t) => ({ id: t.id, code: t.code, name: t.name }));
  const accountIds = new Set(accountOptions.map((a) => a.id));
  const taxCodeIds = new Set(taxCodeOptions.map((t) => t.id));

  const sourceType =
    searchParams.sourceType && (MAPPING_SOURCE_TYPES as readonly string[]).includes(searchParams.sourceType)
      ? (searchParams.sourceType as MappingSourceType)
      : undefined;
  const accountId =
    searchParams.accountId && accountIds.has(searchParams.accountId) ? searchParams.accountId : undefined;
  const taxCodeId =
    searchParams.taxCodeId && taxCodeIds.has(searchParams.taxCodeId) ? searchParams.taxCodeId : undefined;
  const status =
    searchParams.status && (MAPPING_STATUSES as readonly string[]).includes(searchParams.status)
      ? (searchParams.status as "ACTIVE" | "INACTIVE")
      : undefined;
  const q = searchParams.q?.trim().toLowerCase() || undefined;

  const filtered = allMappings.filter((m) => {
    if (sourceType && m.sourceType !== sourceType) return false;
    if (accountId && m.accountId !== accountId) return false;
    if (taxCodeId && m.taxCodeId !== taxCodeId) return false;
    if (status && (status === "ACTIVE") !== m.isActive) return false;
    if (q && !m.name.toLowerCase().includes(q) && !m.sourceValue.toLowerCase().includes(q)) return false;
    return true;
  });

  const hasAnyMappings = allMappings.length > 0;
  const hasActiveFilters = Boolean(q || sourceType || accountId || taxCodeId || status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Company Settings</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>

      <SettingsTabs companyId={company.id} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Account Mapping</h2>
          <p className="text-sm text-ink-500">
            Rules that route a source value (bank description, vendor, customer, category, or
            transaction type) to an account and/or tax code for {company.displayName}.
          </p>
        </div>
        {canManage ? (
          <MappingFormDialog
            mode="create"
            companyId={company.id}
            accounts={accountOptions}
            taxCodes={taxCodeOptions}
          />
        ) : null}
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        {!hasAnyMappings ? (
          <div className="p-4">
            <EmptyState
              icon={Map}
              title="No mappings yet"
              description="Add your first account mapping rule for this company."
              action={
                canManage ? (
                  <MappingFormDialog
                    mode="create"
                    companyId={company.id}
                    accounts={accountOptions}
                    taxCodes={taxCodeOptions}
                    triggerSize="sm"
                    triggerLabel="Add mapping"
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Suspense fallback={<div className="h-[104px] border-b border-ink-100" />}>
              <MappingsFilterBar accounts={accountOptions} taxCodes={taxCodeOptions} />
            </Suspense>

            {filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Map}
                  title="No matching mappings"
                  description={
                    hasActiveFilters
                      ? "Try a different search term or clear your filters."
                      : "No mappings to show."
                  }
                />
              </div>
            ) : (
              <MappingsTable
                companyId={company.id}
                mappings={filtered}
                accounts={accountOptions}
                taxCodes={taxCodeOptions}
                canManage={canManage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
