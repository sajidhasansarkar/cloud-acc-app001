"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createAccountAction, updateAccountAction, setAccountActiveAction } from "@/actions/accounts";
import { getSuggestedSubtypes } from "@/accounting/account-subtypes";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountStatus } from "@/lib/constants";
import type { Account, AccountType } from "@prisma/client";

// Minimal shape the parent-account picker needs — callers can pass the full
// Account list straight through.
export type ParentAccountOption = Pick<Account, "id" | "code" | "name" | "isActive" | "parentAccountId">;

export function AccountForm({
  mode,
  companyId,
  account,
  parentOptions,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  companyId: string;
  /** Required for edit mode. */
  account?: Account;
  /** Candidate accounts for the Parent Account dropdown (the account being
   * edited, if any, should already be excluded by the caller). */
  parentOptions: ParentAccountOption[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [type, setType] = useState<AccountType | "">(account?.type ?? "");
  const [subtype, setSubtype] = useState(account?.subtype ?? "");
  const [parentAccountId, setParentAccountId] = useState(account?.parentAccountId ?? "");
  const [status, setStatus] = useState<AccountStatus>(
    account && !account.isActive ? "INACTIVE" : "ACTIVE"
  );
  const [error, setError] = useState<string | null>(null);

  const subtypeSuggestions = type ? getSuggestedSubtypes(type) : [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError("Account code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Account name is required.");
      return;
    }
    if (!type) {
      setError("Account type is required.");
      return;
    }

    const input = {
      companyId,
      code: code.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      subtype: subtype.trim() || undefined,
      parentAccountId: parentAccountId || undefined,
    };

    startTransition(async () => {
      const result =
        mode === "edit" && account
          ? await updateAccountAction(account.id, input)
          : await createAccountAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Status is managed through the same activate/deactivate action the
      // table's row action uses (src/actions/accounts.ts) rather than a
      // second status field on createAccount/updateAccount — new accounts
      // are always created ACTIVE (see accounting/accounts.ts), so this
      // only ever has something to do in edit mode.
      if (mode === "edit" && account) {
        const wantsActive = status === "ACTIVE";
        if (wantsActive !== account.isActive) {
          const statusResult = await setAccountActiveAction(companyId, account.id, wantsActive);
          if (!statusResult.ok) {
            toast(statusResult.error, "error");
          }
        }
      }

      toast(mode === "edit" ? "Account updated." : "Account created.", "success");
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="flex items-start gap-2 rounded border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">
            Account Code<span className="text-negative"> *</span>
          </Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="1000"
            disabled={mode === "edit"}
            required
          />
          {mode === "edit" ? (
            <p className="text-xs text-ink-500">Account code can&apos;t be changed after creation.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type">
            Account Type<span className="text-negative"> *</span>
          </Label>
          <Select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            required
          >
            <option value="" disabled>
              Select a type
            </option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">
          Account Name<span className="text-negative"> *</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Cash on Hand"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes about how this account is used."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="subtype">Account Subtype</Label>
          <Input
            id="subtype"
            list="account-subtype-suggestions"
            value={subtype ?? ""}
            onChange={(e) => setSubtype(e.target.value)}
            placeholder={type ? "e.g. " + (subtypeSuggestions[0] ?? "") : "Select a type first"}
          />
          <datalist id="account-subtype-suggestions">
            {subtypeSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="text-xs text-ink-500">Free text — pick a suggestion or type your own.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="parentAccountId">Parent Account</Label>
          <Select
            id="parentAccountId"
            value={parentAccountId}
            onChange={(e) => setParentAccountId(e.target.value)}
          >
            <option value="">No parent (top-level account)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
                {!p.isActive ? " (Inactive)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        {mode === "edit" ? (
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        ) : (
          <>
            <Select id="status" value="ACTIVE" disabled>
              <option value="ACTIVE">Active</option>
            </Select>
            <p className="text-xs text-ink-500">
              New accounts start Active. You can deactivate one afterward from its row actions.
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-5">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending
            ? mode === "edit"
              ? "Saving…"
              : "Creating…"
            : mode === "edit"
              ? "Save changes"
              : "Add account"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
