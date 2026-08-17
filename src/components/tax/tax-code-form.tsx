"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createTaxCodeAction, updateTaxCodeAction, setTaxCodeActiveAction } from "@/actions/tax-codes";
import { getSuggestedTaxTypes } from "@/tax/country-tax-guidance";
import {
  TAX_TYPES,
  TAX_TYPE_LABELS,
  CALCULATION_METHODS,
  CALCULATION_METHOD_LABELS,
  TAX_COUNTRIES,
  type TaxCodeStatus,
} from "@/lib/constants";
import type { SerializedTaxCode } from "@/components/tax/types";
import type { TaxType, CalculationMethod } from "@prisma/client";

export function TaxCodeForm({
  mode,
  companyId,
  taxCode,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  companyId: string;
  /** Required for edit mode. */
  taxCode?: SerializedTaxCode;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [countryCode, setCountryCode] = useState(taxCode?.countryCode ?? "");
  const [code, setCode] = useState(taxCode?.code ?? "");
  const [name, setName] = useState(taxCode?.name ?? "");
  const [taxType, setTaxType] = useState<TaxType | "">(taxCode?.taxType ?? "");
  const [calculationMethod, setCalculationMethod] = useState<CalculationMethod | "">(
    taxCode?.calculationMethod ?? "STANDARD_RATE"
  );
  const [rate, setRate] = useState(taxCode ? String(taxCode.rate) : "");
  const [isRecoverable, setIsRecoverable] = useState(taxCode?.isRecoverable ?? true);
  const [status, setStatus] = useState<TaxCodeStatus>(
    taxCode && !taxCode.isActive ? "INACTIVE" : "ACTIVE"
  );
  const [error, setError] = useState<string | null>(null);

  const suggestedTypes = countryCode ? getSuggestedTaxTypes(countryCode) : [];
  const isZeroMethod = calculationMethod && calculationMethod !== "STANDARD_RATE";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!countryCode) {
      setError("Country is required.");
      return;
    }
    if (!code.trim()) {
      setError("Tax code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Tax code name is required.");
      return;
    }
    if (!taxType) {
      setError("Tax type is required.");
      return;
    }
    if (!calculationMethod) {
      setError("Calculation method is required.");
      return;
    }
    if (rate.trim() === "" || Number.isNaN(Number(rate))) {
      setError("Rate must be a valid number.");
      return;
    }

    const input = {
      companyId,
      countryCode,
      code: code.trim(),
      name: name.trim(),
      taxType,
      calculationMethod,
      rate: Number(rate),
      isRecoverable,
    };

    startTransition(async () => {
      const result =
        mode === "edit" && taxCode
          ? await updateTaxCodeAction(taxCode.id, input)
          : await createTaxCodeAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Status is managed through the same activate/deactivate action the
      // table's row action uses (src/actions/tax-codes.ts), same pattern
      // as AccountForm — new tax codes are always created Active, so this
      // only ever has something to do in edit mode.
      if (mode === "edit" && taxCode) {
        const wantsActive = status === "ACTIVE";
        if (wantsActive !== taxCode.isActive) {
          const statusResult = await setTaxCodeActiveAction(companyId, taxCode.id, wantsActive);
          if (!statusResult.ok) {
            toast(statusResult.error, "error");
          }
        }
      }

      toast(mode === "edit" ? "Tax code updated." : "Tax code created.", "success");
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
            Tax Code<span className="text-negative"> *</span>
          </Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="STD"
            disabled={mode === "edit"}
            required
          />
          {mode === "edit" ? (
            <p className="text-xs text-ink-500">Tax code can&apos;t be changed after creation.</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="country">
            Country<span className="text-negative"> *</span>
          </Label>
          <Select
            id="country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a country
            </option>
            {TAX_COUNTRIES.map((c) => (
              <option key={c.countryCode} value={c.countryCode}>
                {c.countryName}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">
          Tax Code Name<span className="text-negative"> *</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard GST"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="taxType">
            Tax Type<span className="text-negative"> *</span>
          </Label>
          <Select
            id="taxType"
            value={taxType}
            onChange={(e) => setTaxType(e.target.value as TaxType)}
            required
          >
            <option value="" disabled>
              Select a type
            </option>
            {TAX_TYPES.map((t) => (
              <option key={t} value={t}>
                {TAX_TYPE_LABELS[t]}
                {suggestedTypes.includes(t) ? " (suggested)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="calculationMethod">
            Calculation Method<span className="text-negative"> *</span>
          </Label>
          <Select
            id="calculationMethod"
            value={calculationMethod}
            onChange={(e) => {
              const next = e.target.value as CalculationMethod;
              setCalculationMethod(next);
              if (next !== "STANDARD_RATE") setRate("0");
            }}
            required
          >
            {CALCULATION_METHODS.map((m) => (
              <option key={m} value={m}>
                {CALCULATION_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rate">
            Rate (%)<span className="text-negative"> *</span>
          </Label>
          <Input
            id="rate"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={Boolean(isZeroMethod)}
            required
          />
          {isZeroMethod ? (
            <p className="text-xs text-ink-500">
              Zero-rated, exempt, and out-of-scope codes are always 0%.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="isRecoverable">Recoverable</Label>
          <Select
            id="isRecoverable"
            value={isRecoverable ? "yes" : "no"}
            onChange={(e) => setIsRecoverable(e.target.value === "yes")}
          >
            <option value="yes">Yes — recoverable as input tax credit</option>
            <option value="no">No — not recoverable</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        {mode === "edit" ? (
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as TaxCodeStatus)}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        ) : (
          <>
            <Select id="status" value="ACTIVE" disabled>
              <option value="ACTIVE">Active</option>
            </Select>
            <p className="text-xs text-ink-500">
              New tax codes start Active. You can deactivate one afterward from its row actions.
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
              : "Add tax code"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
