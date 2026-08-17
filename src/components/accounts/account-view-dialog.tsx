"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/accounts/account-status-badge";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { Account, AccountType } from "@prisma/client";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mt-0.5 text-sm text-ink-900">{value}</div>
    </div>
  );
}

export function AccountViewDialog({
  account,
  parentAccount,
}: {
  account: Account;
  parentAccount: Account | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="View"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
      >
        <Eye className="h-4 w-4" />
        <span className="sr-only">View</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`${account.code} — ${account.name}`}
        description="Account details."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account Code" value={account.code} />
          <Field label="Status" value={<AccountStatusBadge isActive={account.isActive} />} />
          <Field label="Account Name" value={account.name} />
          <Field label="Account Type" value={ACCOUNT_TYPE_LABELS[account.type as AccountType]} />
          <Field label="Subtype" value={account.subtype || "—"} />
          <Field label="Parent Account" value={parentAccount ? `${parentAccount.code} — ${parentAccount.name}` : "None (top-level)"} />
          <Field label="Created" value={formatDate(account.createdAt)} />
          <Field label="Last Updated" value={formatDate(account.updatedAt)} />
        </div>
        <div className="mt-4">
          <Field label="Description" value={account.description || "—"} />
        </div>
        {account.isSystemAccount ? (
          <p className="mt-4 text-xs text-ink-500">
            This is a system account used internally by the platform.
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
