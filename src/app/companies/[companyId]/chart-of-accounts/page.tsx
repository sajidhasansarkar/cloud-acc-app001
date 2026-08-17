import { Suspense } from "react";
import { ListTree } from "lucide-react";
import type { AccountType } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listAccounts } from "@/accounting/accounts";
import {
  buildAccountTree,
  getDistinctSubtypes,
  getFilteredSortedAccounts,
  getMatchingAccountIds,
  getVisibleAccountIds,
  hasActiveFilters,
  type AccountFilters,
} from "@/accounting/account-tree";
import { canManageAccounts } from "@/lib/rbac";
import { EmptyState } from "@/components/ui/empty-state";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { AccountTreeView } from "@/components/accounts/account-tree-view";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountsFilterBar } from "@/components/accounts/accounts-filter-bar";
import {
  ACCOUNT_SORT_OPTIONS,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_SORT,
  type AccountSortKey,
} from "@/lib/constants";

export const metadata = { title: "Chart of Accounts — Ledger" };

const SORT_KEYS = ACCOUNT_SORT_OPTIONS.map((o) => o.value);

// Phase 3A-3: tree, search, filter, and sort on top of Phase 3A-2's basic
// list. All read/write access still goes through
// src/actions/accounts.ts -> src/accounting/accounts.ts, which re-derive
// Organization -> Company -> Account ownership on every call — this page
// never trusts companyId or an accountId from the browser on its own.
// Search/filter/sort themselves are applied in-memory over that
// already-scoped list (src/accounting/account-tree.ts), so a crafted query
// string can never widen the result beyond the caller's own company.
// Balances, journal entries, transactions, the ledger, tax, AI, and reports
// are intentionally out of scope here (see src/accounting/README.md).
export default async function ChartOfAccountsPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { q?: string; type?: string; subtype?: string; status?: string; sort?: string; view?: string };
}) {
  const { role, organization } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);

  const accounts = (await listAccounts(organization.id, company.id)) ?? [];
  const canManage = canManageAccounts(role);

  const q = searchParams.q?.trim() || undefined;
  const type = searchParams.type && (ACCOUNT_TYPES as readonly string[]).includes(searchParams.type)
    ? (searchParams.type as AccountType)
    : undefined;
  const subtype = searchParams.subtype?.trim() || undefined;
  const status = searchParams.status && (ACCOUNT_STATUSES as readonly string[]).includes(searchParams.status)
    ? (searchParams.status as "ACTIVE" | "INACTIVE")
    : undefined;
  const sort = searchParams.sort && (SORT_KEYS as readonly string[]).includes(searchParams.sort)
    ? (searchParams.sort as AccountSortKey)
    : DEFAULT_ACCOUNT_SORT;
  const view = searchParams.view === "list" ? "list" : "tree";

  const filters: AccountFilters = { q, type, subtype, status };
  const filtering = hasActiveFilters(filters);
  const matchedIds = getMatchingAccountIds(accounts, filters);
  const visibleIds = getVisibleAccountIds(accounts, matchedIds);
  const tree = buildAccountTree(accounts, sort);
  const filteredFlat = getFilteredSortedAccounts(accounts, filters, sort);
  const subtypeOptions = getDistinctSubtypes(accounts);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Chart of Accounts</h1>
          <p className="text-sm text-ink-500">
            The account structure for {company.displayName}.
          </p>
        </div>
        {canManage ? <AccountFormDialog mode="create" companyId={company.id} accounts={accounts} /> : null}
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        {accounts.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ListTree}
              title="No accounts yet"
              description="Add your first account to start building the chart of accounts."
              action={
                canManage ? (
                  <AccountFormDialog
                    mode="create"
                    companyId={company.id}
                    accounts={accounts}
                    triggerSize="sm"
                    triggerLabel="Add account"
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Suspense fallback={<div className="h-[104px] border-b border-ink-100" />}>
              <AccountsFilterBar subtypes={subtypeOptions} />
            </Suspense>

            {view === "list" ? (
              filteredFlat.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={ListTree}
                    title="No matching accounts"
                    description="Try a different search term or clear your filters."
                  />
                </div>
              ) : (
                <AccountsTable
                  companyId={company.id}
                  accounts={filteredFlat}
                  allAccounts={accounts}
                  canManage={canManage}
                />
              )
            ) : (
              <AccountTreeView
                companyId={company.id}
                tree={tree}
                allAccounts={accounts}
                canManage={canManage}
                filtering={filtering}
                matchedIds={matchedIds}
                visibleIds={visibleIds}
                matchedCount={matchedIds.size}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
