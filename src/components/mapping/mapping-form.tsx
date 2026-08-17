"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createAccountMappingAction,
  updateAccountMappingAction,
  setAccountMappingActiveAction,
} from "@/actions/account-mappings";
import { MAPPING_SOURCE_TYPES, MAPPING_SOURCE_TYPE_LABELS, type MappingStatus } from "@/lib/constants";
import type { AccountOption, TaxCodeOption } from "@/components/mapping/types";
import type { AccountMapping, MappingSourceType } from "@prisma/client";

export function MappingForm({
  mode,
  companyId,
  mapping,
  accounts,
  taxCodes,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  companyId: string;
  /** Required for edit mode. */
  mapping?: AccountMapping;
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(mapping?.name ?? "");
  const [sourceType, setSourceType] = useState<MappingSourceType | "">(
    mapping?.sourceType ?? "BANK_DESCRIPTION"
  );
  const [sourceValue, setSourceValue] = useState(mapping?.sourceValue ?? "");
  const [accountId, setAccountId] = useState(mapping?.accountId ?? "");
  const [taxCodeId, setTaxCodeId] = useState(mapping?.taxCodeId ?? "");
  const [priority, setPriority] = useState(mapping ? String(mapping.priority) : "0");
  const [status, setStatus] = useState<MappingStatus>(
    mapping && !mapping.isActive ? "INACTIVE" : "ACTIVE"
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Mapping name is required.");
      return;
    }
    if (!sourceType) {
      setError("Source type is required.");
      return;
    }
    if (!sourceValue.trim()) {
      setError("Source value is required.");
      return;
    }
    if (!accountId && !taxCodeId) {
      setError("Select an account, a tax code, or both.");
      return;
    }
    if (priority.trim() === "" || !Number.isInteger(Number(priority))) {
      setError("Priority must be a whole number.");
      return;
    }

    const input = {
      companyId,
      name: name.trim(),
      sourceType,
      sourceValue: sourceValue.trim(),
      accountId: accountId || undefined,
      taxCodeId: taxCodeId || undefined,
      priority: Number(priority),
    };

    startTransition(async () => {
      const result =
        mode === "edit" && mapping
          ? await updateAccountMappingAction(mapping.id, input)
          : await createAccountMappingAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Status is managed through the same activate/deactivate action the
      // table's row action uses (src/actions/account-mappings.ts), same
      // pattern as TaxCodeForm — new mappings are always created Active,
      // so this only ever has something to do in edit mode.
      if (mode === "edit" && mapping) {
        const wantsActive = status === "ACTIVE";
        if (wantsActive !== mapping.isActive) {
          const statusResult = await setAccountMappingActiveAction(companyId, mapping.id, wantsActive);
          if (!statusResult.ok) {
            toast(statusResult.error, "error");
          }
        }
      }

      toast(mode === "edit" ? "Mapping updated." : "Mapping created.", "success");
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

      <div className="space-y-1.5">
        <Label htmlFor="name">
          Mapping Name<span className="text-negative"> *</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Starbucks → Meals & Entertainment"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sourceType">
            Source Type<span className="text-negative"> *</span>
          </Label>
          <Select
            id="sourceType"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as MappingSourceType)}
            required
          >
            {MAPPING_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {MAPPING_SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sourceValue">
            Source Value<span className="text-negative"> *</span>
          </Label>
          <Input
            id="sourceValue"
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
            placeholder="STARBUCKS"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taxCodeId">Tax Code</Label>
          <Select id="taxCodeId" value={taxCodeId} onChange={(e) => setTaxCodeId(e.target.value)}>
            <option value="">None</option>
            {taxCodes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="-mt-3 text-xs text-ink-500">At least one of Account or Tax Code is required.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="priority">
            Priority<span className="text-negative"> *</span>
          </Label>
          <Input
            id="priority"
            type="number"
            step="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            required
          />
          <p className="text-xs text-ink-500">Higher priority rules take precedence.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          {mode === "edit" ? (
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as MappingStatus)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          ) : (
            <>
              <Select id="status" value="ACTIVE" disabled>
                <option value="ACTIVE">Active</option>
              </Select>
              <p className="text-xs text-ink-500">
                New mappings start Active. You can deactivate one afterward from its row actions.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-5">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending
            ? mode === "edit"
              ? "Saving…"
              : "Creating…"
            : mode === "edit"
              ? "Save changes"
              : "Add mapping"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
