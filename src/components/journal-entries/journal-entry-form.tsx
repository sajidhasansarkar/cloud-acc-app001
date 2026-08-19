"use client";

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createJournalEntryAction, updateJournalEntryAction } from "@/actions/journal-entries";
import { listAccountingPeriodsAction } from "@/actions/accounting-periods";
import { JOURNAL_ENTRY_SOURCE_TYPES, JOURNAL_ENTRY_SOURCE_TYPE_LABELS } from "@/lib/constants";
import { JournalLinesEditor, type JournalLineDraft } from "@/components/journal-entries/journal-lines-editor";
import type { Account, AccountingPeriod, FiscalYear, JournalEntrySourceType } from "@prisma/client";

function toDateInputValue(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

type JournalEntryFormEntry = {
  id: string;
  entryNumber: string;
  entryDate: Date | string;
  fiscalYearId: string;
  accountingPeriodId: string;
  reference: string | null;
  description: string | null;
  label: string | null;
  sourceType: JournalEntrySourceType;
  version: number;
};

export function JournalEntryForm({
  mode,
  companyId,
  fiscalYears,
  initialPeriods,
  entry,
  defaultFiscalYearId,
  defaultAccountingPeriodId,
  cancelHref,
  accounts,
  taxCodes = [],
  initialLines,
}: {
  mode: "create" | "edit";
  companyId: string;
  /** Every fiscal year for this company (spec section 5 — no fiscal-year
   * creation from this screen, just a selection from existing ones). */
  fiscalYears: FiscalYear[];
  /** Accounting periods belonging to whichever fiscal year is selected on
   * first render — refetched client-side (see handleFiscalYearChange)
   * whenever the user picks a different fiscal year. */
  initialPeriods: AccountingPeriod[];
  entry?: JournalEntryFormEntry;
  defaultFiscalYearId?: string;
  defaultAccountingPeriodId?: string;
  cancelHref: string;
  /** This company's Chart of Accounts (spec sections 3-4) — reused as-is
   * from listAccounts/listAccountsAction, never redefined here. */
  accounts: Pick<Account, "id" | "code" | "name" | "type" | "isActive">[];
  taxCodes?: { id: string; code: string; name: string; isActive: boolean }[];
  /** Existing lines when editing a draft (spec section 15), already
   * converted to string debit/credit so no Decimal/float parsing happens
   * client-side. Omitted (or empty) for a brand-new entry. */
  initialLines?: JournalLineDraft[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);

  const [entryNumber, setEntryNumber] = useState(entry?.entryNumber ?? "");
  const [entryDate, setEntryDate] = useState(entry ? toDateInputValue(entry.entryDate) : "");
  const [fiscalYearId, setFiscalYearId] = useState(
    entry?.fiscalYearId ?? defaultFiscalYearId ?? fiscalYears[0]?.id ?? ""
  );
  const [accountingPeriodId, setAccountingPeriodId] = useState(
    entry?.accountingPeriodId ?? defaultAccountingPeriodId ?? ""
  );
  const [periods, setPeriods] = useState<AccountingPeriod[]>(initialPeriods);
  const [reference, setReference] = useState(entry?.reference ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [label, setLabel] = useState(entry?.label ?? "");
  const [sourceType, setSourceType] = useState<JournalEntrySourceType>(entry?.sourceType ?? "MANUAL");
  const [lines, setLines] = useState<JournalLineDraft[]>(initialLines ?? []);
  const [error, setError] = useState<string | null>(null);
  const initialSnapshot = useRef<string | null>(null);

  useEffect(() => {
    if (initialSnapshot.current === null) {
      initialSnapshot.current = JSON.stringify({ entryDate, fiscalYearId, accountingPeriodId, reference, description, label, sourceType, lines });
    }
  }, []);

  useEffect(() => {
    if (mode !== "edit" || initialSnapshot.current === null) return;
    const current = JSON.stringify({ entryDate, fiscalYearId, accountingPeriodId, reference, description, label, sourceType, lines });
    const dirty = current !== initialSnapshot.current;
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [mode, entryDate, fiscalYearId, accountingPeriodId, reference, description, label, sourceType, lines]);

  // Accounting Period options must always belong to the selected Fiscal
  // Year (spec section 6/13) — refetch from the server (never trust a
  // client-cached list from another fiscal year) whenever the selection
  // changes, and clear the current period pick since it's very likely no
  // longer valid for the new fiscal year.
  function handleFiscalYearChange(nextFiscalYearId: string) {
    setFiscalYearId(nextFiscalYearId);
    setAccountingPeriodId("");
    setPeriods([]);
    if (!nextFiscalYearId) return;

    setIsLoadingPeriods(true);
    startTransition(async () => {
      try {
        const result = await listAccountingPeriodsAction(companyId, nextFiscalYearId);
        setPeriods(result ?? []);
      } finally {
        setIsLoadingPeriods(false);
      }
    });
  }

  function hasUnsavedChanges() {
    if (initialSnapshot.current === null) return false;
    return JSON.stringify({ entryDate, fiscalYearId, accountingPeriodId, reference, description, label, sourceType, lines }) !== initialSnapshot.current;
  }

  function handleCancel(e: React.MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedChanges()) {
      const leave = window.confirm("You have unsaved changes. Select OK to Leave or Cancel to Stay.");
      if (!leave) e.preventDefault();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "create" && !entryNumber.trim()) {
      setError("Entry number is required.");
      return;
    }
    if (!entryDate || !fiscalYearId || !accountingPeriodId) {
      setError("Entry date, fiscal year, and accounting period are required.");
      return;
    }
    if (mode === "create" && lines.length < 1) {
      setError("At least one journal line is required.");
      return;
    }

    // A blank row the user added but never touched (no account, no
    // amounts, no text) is a UI placeholder, not a real line — drop it
    // rather than sending it to the server, where accountId is required
    // (spec section 13 still allows saving genuinely incomplete lines,
    // e.g. an account picked with debit/credit left at 0; this only
    // skips rows with nothing entered at all).
    const linesPayload = lines
      .filter(
        (line) =>
          line.accountId ||
          line.description.trim() ||
          line.reference.trim() ||
          line.debit.trim() ||
          line.credit.trim()
      )
      .map((line) => ({
        lineId: line.lineId,
        accountId: line.accountId,
        taxCodeId: line.taxCodeId || undefined,
        description: line.description.trim() || undefined,
        reference: line.reference.trim() || undefined,
        debit: line.debit.trim() || "0",
        credit: line.credit.trim() || "0",
      }));

    startTransition(async () => {
      const result =
        mode === "edit" && entry
          ? await updateJournalEntryAction(entry.id, {
              companyId,
              fiscalYearId,
              accountingPeriodId,
              entryDate,
              expectedVersion: entry.version,
              reference: reference.trim() || undefined,
              description: description.trim() || undefined,
              label: label.trim() || undefined,
              sourceType: "MANUAL",
              lines: linesPayload,
            })
          : await createJournalEntryAction({
              companyId,
              fiscalYearId,
              accountingPeriodId,
              entryNumber: entryNumber.trim(),
              entryDate,
              expectedVersion: entry.version,
              reference: reference.trim() || undefined,
              description: description.trim() || undefined,
              label: label.trim() || undefined,
              sourceType,
              lines: linesPayload,
            });

      if (result.ok) {
        toast(mode === "edit" ? "Journal entry updated." : "Journal entry saved as draft.", "success");
        router.push(`/companies/${companyId}/journal-entries/${result.entry.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {error ? (
        <div className="flex items-start gap-2 rounded border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="entryNumber">
            Entry Number<span className="text-negative"> *</span>
          </Label>
          <Input
            id="entryNumber"
            value={entryNumber}
            onChange={(e) => setEntryNumber(e.target.value)}
            placeholder="JE-0001"
            disabled={mode === "edit"}
            required
          />
          {mode === "edit" ? (
            <p className="text-xs text-ink-500">Entry number can&apos;t be changed once created.</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entryDate">
            Entry Date<span className="text-negative"> *</span>
          </Label>
          <Input
            id="entryDate"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fiscalYearId">
            Fiscal Year<span className="text-negative"> *</span>
          </Label>
          <Select
            id="fiscalYearId"
            value={fiscalYearId}
            onChange={(e) => handleFiscalYearChange(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a fiscal year
            </option>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountingPeriodId">
            Accounting Period<span className="text-negative"> *</span>
          </Label>
          <Select
            id="accountingPeriodId"
            value={accountingPeriodId}
            onChange={(e) => setAccountingPeriodId(e.target.value)}
            disabled={!fiscalYearId || isLoadingPeriods}
            required
          >
            <option value="" disabled>
              {isLoadingPeriods
                ? "Loading periods…"
                : periods.length === 0
                  ? "No periods for this fiscal year"
                  : "Select a period"}
            </option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reference">Reference</Label>
        <Input
          id="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Invoice #, PO #, etc."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this entry is for"
        />
      </div>

      {mode === "create" ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional tag"
            />
          </div>

        </div>
  
        ) : null}

      <div className="border-t border-ink-100 pt-6">
        <JournalLinesEditor accounts={accounts} taxCodes={taxCodes} lines={lines} onChange={setLines} disabled={isPending} />
      </div>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-6">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Draft"}
        </Button>
        <a href={cancelHref} onClick={handleCancel} className="text-sm text-ink-500 hover:text-ink-800">
          Cancel
        </a>
      </div>
    </form>
  );
}
