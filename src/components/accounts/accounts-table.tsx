"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountStatusBadge } from "@/components/accounts/account-status-badge";
import { AccountViewDialog } from "@/components/accounts/account-view-dialog";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountStatusAction } from "@/components/accounts/account-status-action";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import type { Account, AccountType } from "@prisma/client";

export function AccountsTable({
  companyId,
  accounts,
  allAccounts,
  canManage,
}: {
  companyId: string;
  /** Rows to render — may be a filtered/sorted subset of the company's
   * accounts (Phase 3A-3 search & filters). */
  accounts: Account[];
  /** Full, unfiltered account list for this company, used to resolve
   * parent/children names even when `accounts` is a filtered subset.
   * Defaults to `accounts` for callers that pass the full list. */
  allAccounts?: Account[];
  canManage: boolean;
}) {
  const lookupSet = allAccounts ?? accounts;
  // Built once per render for O(1) parent-name lookups instead of an
  // Array.find() per row.
  const byId = new Map(lookupSet.map((a) => [a.id, a]));
  const childrenByParent = new Map<string, Account[]>();
  for (const a of lookupSet) {
    if (!a.parentAccountId) continue;
    const bucket = childrenByParent.get(a.parentAccountId);
    if (bucket) bucket.push(a);
    else childrenByParent.set(a.parentAccountId, [a]);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Account Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Subtype</TableHead>
          <TableHead>Parent Account</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const parent = account.parentAccountId ? byId.get(account.parentAccountId) ?? null : null;
          return (
            <TableRow key={account.id}>
              <TableCell className="font-mono text-xs font-medium text-ink-900">{account.code}</TableCell>
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell className="text-ink-500">{ACCOUNT_TYPE_LABELS[account.type as AccountType]}</TableCell>
              <TableCell className="text-ink-500">{account.subtype || "—"}</TableCell>
              <TableCell className="text-ink-500">
                {parent ? `${parent.code} — ${parent.name}` : "—"}
              </TableCell>
              <TableCell>
                <AccountStatusBadge isActive={account.isActive} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <AccountViewDialog
                    account={account}
                    parentAccount={parent}
                    childAccounts={childrenByParent.get(account.id) ?? []}
                  />
                  {canManage ? (
                    <>
                      <AccountFormDialog mode="edit" companyId={companyId} account={account} accounts={lookupSet} />
                      <AccountStatusAction
                        companyId={companyId}
                        accountId={account.id}
                        accountLabel={`${account.code} — ${account.name}`}
                        isActive={account.isActive}
                      />
                    </>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
