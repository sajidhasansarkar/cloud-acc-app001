"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AccountForm, type ParentAccountOption } from "@/components/accounts/account-form";
import type { Account } from "@prisma/client";

type BaseProps = {
  companyId: string;
  /** Full account list for this company — used to build the Parent Account
   * dropdown. The account being edited (if any) is filtered out below so
   * it can never be picked as its own parent. */
  accounts: ParentAccountOption[];
};

type CreateProps = BaseProps & {
  mode: "create";
  account?: undefined;
  triggerSize?: "default" | "sm";
  triggerLabel?: string;
};

type EditProps = BaseProps & {
  mode: "edit";
  account: Account;
};

export function AccountFormDialog(props: CreateProps | EditProps) {
  const { mode, companyId, accounts } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const parentOptions =
    mode === "edit" ? accounts.filter((a) => a.id !== props.account.id) : accounts;

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button
          type="button"
          variant="primary"
          size={props.triggerSize ?? "default"}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {props.triggerLabel ?? "Add Account"}
        </Button>
      ) : (
        <button
          type="button"
          title="Edit"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit</span>
        </button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={mode === "edit" ? "Edit Account" : "Add Account"}
        description={
          mode === "edit"
            ? `Update details for ${props.account.code} — ${props.account.name}.`
            : "Add a new account to this company's chart of accounts."
        }
      >
        {open ? (
          <AccountForm
            mode={mode}
            companyId={companyId}
            account={mode === "edit" ? props.account : undefined}
            parentOptions={parentOptions}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
