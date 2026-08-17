import { ListTree } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { listAccounts } from "@/accounting/accounts";
import { canManageAccounts } from "@/lib/rbac";
import { EmptyState } from "@/components/ui/empty-state";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";

export const metadata = { title: "Chart of Accounts — Ledger" };

// Phase 3A-2: the basic Chart of Accounts UI. All read/write access goes
// through src/actions/accounts.ts -> src/accounting/accounts.ts, which
// re-derive Organization -> Company -> Account ownership on every call —
// this page never trusts companyId or an accountId from the browser on its
// own. Journal entries, transactions, the ledger, tax, AI, and reports are
// intentionally out of scope here (see src/accounting/README.md).
export default async function ChartOfAccountsPage({
  params,
}: {
  params: { companyId: string };
}) {
  const { role, organization } = await requireActiveOrganization();

  // requireOwnedCompany re-derives Organization -> Company ownership from
  // the session; companyId from the URL is never trusted on its own.
  const company = await requireOwnedCompany(params.companyId);

  const accounts = (await listAccounts(organization.id, company.id)) ?? [];
  const canManage = canManageAccounts(role);

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
          <AccountsTable companyId={company.id} accounts={accounts} canManage={canManage} />
        )}
      </div>
    </div>
  );
}
