"use client";

import * as React from "react";
import { useId } from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, GripVertical, ListChecks, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountPicker } from "@/components/journal-entries/account-picker";
import { cn } from "@/lib/utils";
import {
  compareDecimalStrings,
  isNegativeDecimal,
  isPositiveDecimal,
  subtractDecimalStrings,
  sumDecimalStrings,
} from "@/lib/journal-entry-balance";
import { JournalEntryBalanceSummary } from "@/components/journal-entries/journal-entry-balance-summary";
import type { Account } from "@prisma/client";

/**
 * Journal Lines editor (Phase 4A-3B-1).
 *
 * Live totals use exact fixed-point client arithmetic for display. The
 * authoritative persisted calculation still uses Prisma.Decimal on the
 * server. Drafts remain saveable while empty, incomplete, or unbalanced;
 * the UI reports the current validation state without implementing posting.
 */

export type JournalLineDraft = {
  /** Client-only identity for React keys / stable row identity across
   * add/remove — never sent to the server and unrelated to the eventual
   * JournalEntryLine.id. */
  key: string;
  lineId?: string;
  accountId: string;
  taxCodeId: string;
  description: string;
  accountSource: "AI" | "USER";
  descriptionSource: "AI" | "USER";
  debitSource: "AI" | "USER";
  creditSource: "AI" | "USER";
  taxCodeSource: "AI" | "USER";
  referenceSource: "AI" | "USER";
  reference: string;
  /** Raw text as typed — kept as a string end-to-end (never parsed to a
   * JS float) so no floating-point rounding is introduced before the
   * value reaches the server, which parses it into Prisma.Decimal (spec
   * sections 7-8). */
  debit: string;
  credit: string;
};

let keyCounter = 0;
export function newJournalLineDraft(): JournalLineDraft {
  keyCounter += 1;
  return {
    key: `line-${Date.now()}-${keyCounter}`,
    accountId: "",
    taxCodeId: "",
    description: "",
    accountSource: "USER",
    descriptionSource: "USER",
    debitSource: "USER",
    creditSource: "USER",
    taxCodeSource: "USER",
    referenceSource: "USER",
    reference: "",
    debit: "",
    credit: "",
  };
}

function isZeroOrEmpty(v: string) {
  return v.trim() === "" || compareDecimalStrings(v, "0") === 0;
}

// Keeps the amount as text so the client never performs money arithmetic
// with JavaScript Number. A leading minus is retained so pasted/typed
// negative values can be surfaced with the required validation message.
function sanitizeAmount(raw: string): string {
  const negative = raw.trim().startsWith("-");
  let v = raw.replace(/[^0-9.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  return negative ? `-${v}` : v;
}

export function JournalLinesEditor({
  accounts,
  taxCodes = [],
  lines,
  onChange,
  disabled,
}: {
  accounts: Pick<Account, "id" | "code" | "name" | "type" | "isActive">[];
  taxCodes?: { id: string; code: string; name: string; isActive: boolean }[];
  lines: JournalLineDraft[];
  onChange: (lines: JournalLineDraft[]) => void;
  disabled?: boolean;
}) {
  const headingId = useId();
  const [removeKey, setRemoveKey] = React.useState<string | null>(null);
  const [dragKey, setDragKey] = React.useState<string | null>(null);

  function updateLine(key: string, patch: Partial<JournalLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function handleDebitChange(key: string, raw: string) {
    const value = sanitizeAmount(raw);
    const hasAmount = !isZeroOrEmpty(value);
    updateLine(key, { debit: value, credit: hasAmount ? "" : lines.find((l) => l.key === key)?.credit ?? "", debitSource: "USER", creditSource: hasAmount ? "USER" : lines.find((l) => l.key === key)?.creditSource ?? "USER" });
  }

  function handleCreditChange(key: string, raw: string) {
    const value = sanitizeAmount(raw);
    const hasAmount = !isZeroOrEmpty(value);
    updateLine(key, { credit: value, debit: hasAmount ? "" : lines.find((l) => l.key === key)?.debit ?? "", creditSource: "USER", debitSource: hasAmount ? "USER" : lines.find((l) => l.key === key)?.debitSource ?? "USER" });
  }

  function addLine(afterKey?: string) {
    const next = newJournalLineDraft();
    if (!afterKey) onChange([...lines, next]);
    else {
      const index = lines.findIndex((line) => line.key === afterKey);
      onChange(index < 0 ? [...lines, next] : [...lines.slice(0, index + 1), next, ...lines.slice(index + 1)]);
    }
  }

  function moveBefore(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    const from = lines.findIndex((line) => line.key === dragKey);
    const to = lines.findIndex((line) => line.key === targetKey);
    if (from < 0 || to < 0) return;
    const next = [...lines];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    onChange(next);
    setDragKey(null);
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
    setRemoveKey(null);
  }

  function moveByIndex(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  const totalDebit = sumDecimalStrings(lines.map((l) => l.debit));
  const totalCredit = sumDecimalStrings(lines.map((l) => l.credit));
  const difference = subtractDecimalStrings(totalDebit, totalCredit);

  const lineErrors = lines.map((line) => {
    const debitEntered = !isZeroOrEmpty(line.debit);
    const creditEntered = !isZeroOrEmpty(line.credit);

    if (isNegativeDecimal(line.debit) || isNegativeDecimal(line.credit)) {
      return "Amount cannot be negative.";
    }
    if (debitEntered && creditEntered) {
      return "Debit and Credit cannot both contain values.";
    }
    if (!debitEntered && !creditEntered) {
      return "Debit or Credit amount is required.";
    }
    if (!line.accountId) {
      return "Account is required.";
    }
    return null;
  });
  const validLineCount = lines.filter((line) => {
    const debitEntered = isPositiveDecimal(line.debit);
    const creditEntered = isPositiveDecimal(line.credit);
    return Boolean(line.accountId) && (debitEntered !== creditEntered);
  }).length;
  const firstLineError = lineErrors.find(Boolean) ?? null;
  const validationMessage = firstLineError ?? (validLineCount < 2 ? "At least two valid journal lines are required." : null);
  const balanced = !validationMessage && compareDecimalStrings(difference, "0") === 0;
  const balanceMessage = balanced
    ? null
    : validationMessage ?? (compareDecimalStrings(difference, "0") > 0 ? "Debit exceeds Credit" : "Credit exceeds Debit");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id={headingId} className="font-display text-sm font-semibold text-ink-900">
          Journal Lines
        </h3>
        {lines.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={disabled}>
            <Plus className="h-3.5 w-3.5" />
            Add Line
          </Button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No journal lines added."
          action={
            <Button type="button" variant="primary" size="sm" onClick={addLine} disabled={disabled}>
              <Plus className="h-3.5 w-3.5" />
              Add Line
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-ink-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">↕</TableHead><TableHead className="w-10">#</TableHead>
                <TableHead className="min-w-[220px]">Account</TableHead>
                <TableHead className="min-w-[160px]">Description</TableHead>
                <TableHead className="min-w-[140px]">Reference</TableHead>
                <TableHead className="min-w-[150px]">Tax Code</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
                <TableHead className="w-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const bothEntered = !isZeroOrEmpty(line.debit) && !isZeroOrEmpty(line.credit);
                const incomplete = isZeroOrEmpty(line.debit) && isZeroOrEmpty(line.credit);
                const debitDisabled = disabled || !isZeroOrEmpty(line.credit);
                const creditDisabled = disabled || !isZeroOrEmpty(line.debit);

                return (
                  <React.Fragment key={line.key}>
                  <TableRow draggable={!disabled} onDragStart={() => setDragKey(line.key)} onDragOver={(e) => e.preventDefault()} onDrop={() => moveBefore(line.key)} className={cn(dragKey === line.key ? "opacity-50" : "")}>
                    <TableCell className="cursor-grab text-ink-400"><GripVertical className="h-4 w-4" aria-label={`Drag line ${index + 1}`} /></TableCell>
                    <TableCell className="text-ink-500">{index + 1}</TableCell>
                    <TableCell>
                      <AccountPicker
                        accounts={accounts}
                        value={line.accountId}
                        onChange={(accountId) => updateLine(line.key, { accountId, accountSource: "USER" })}
                        disabled={disabled}
                      />
                      <span className="text-[10px] text-ink-400">{line.accountSource === "AI" ? "AI Suggested Account" : "User Changed Account"}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value, descriptionSource: "USER" })}
                        placeholder="Line description"
                        disabled={disabled}
                        aria-label={`Line ${index + 1} description`}
                      />
                      <span className="text-[10px] text-ink-400">{line.descriptionSource === "AI" ? "AI Suggested" : "User"}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.reference}
                        onChange={(e) => updateLine(line.key, { reference: e.target.value, referenceSource: "USER" })}
                        placeholder="Invoice #, receipt #…"
                        disabled={disabled}
                        aria-label={`Line ${index + 1} reference`}
                      />
                      <span className="text-[10px] text-ink-400">{line.referenceSource === "AI" ? "AI Suggested" : "User"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <select value={line.taxCodeId} onChange={(e) => updateLine(line.key, { taxCodeId: e.target.value, taxCodeSource: "USER" })} disabled={disabled} className="h-9 w-full rounded border border-ink-200 bg-white px-2 text-sm">
                          <option value="">No tax code</option>
                          {taxCodes.filter((tax) => tax.isActive).map((tax) => <option key={tax.id} value={tax.id}>{tax.code} — {tax.name}</option>)}
                        </select>
                        <span className="text-[10px] text-ink-400">{line.taxCodeSource === "AI" ? "AI Suggested" : "User"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={line.debit}
                        onChange={(e) => handleDebitChange(line.key, e.target.value)}
                        placeholder="0.00"
                        disabled={debitDisabled}
                        className={cn("text-right", bothEntered ? "border-negative/60" : "")}
                        aria-label={`Line ${index + 1} debit`}
                      />
                      <span className="text-[10px] text-ink-400">{line.debitSource === "AI" ? "AI Suggested" : "User"}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={line.credit}
                        onChange={(e) => handleCreditChange(line.key, e.target.value)}
                        placeholder="0.00"
                        disabled={creditDisabled}
                        className={cn("text-right", bothEntered ? "border-negative/60" : "")}
                        aria-label={`Line ${index + 1} credit`}
                      />
                      <span className="text-[10px] text-ink-400">{line.creditSource === "AI" ? "AI Suggested" : "User"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" onClick={() => moveByIndex(index, -1)} disabled={disabled || index === 0} aria-label={`Move line ${index + 1} up`} className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-400 hover:bg-surface-muted disabled:opacity-40"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => moveByIndex(index, 1)} disabled={disabled || index === lines.length - 1} aria-label={`Move line ${index + 1} down`} className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-400 hover:bg-surface-muted disabled:opacity-40"><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button
                        type="button"
                        onClick={() => setRemoveKey(line.key)}
                        disabled={disabled}
                        aria-label={`Remove line ${index + 1}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-400 hover:bg-negative/10 hover:text-negative disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-surface-subtle">
                    <TableCell colSpan={9} className="py-1">
                      <button type="button" onClick={() => addLine(line.key)} disabled={disabled} className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-900 disabled:opacity-50"><ArrowDownToLine className="h-3 w-3" />Insert line after</button>
                    </TableCell>
                  </TableRow>
                  {lineErrors[index] ? (
                    <tr>
                      <td colSpan={9} className="px-4 pb-2 pt-0">
                        <p className="text-xs text-negative">{lineErrors[index]}</p>
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>

        </div>
      )}

      <JournalEntryBalanceSummary
        totalDebit={totalDebit}
        totalCredit={totalCredit}
        difference={difference}
        balanced={balanced}
        validationMessage={balanceMessage}
      />

      <Dialog
        open={removeKey !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveKey(null);
        }}
        title="Remove journal line?"
        description="This removes the line from the draft. The remaining lines will be renumbered when the draft is saved."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setRemoveKey(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removeKey) removeLine(removeKey);
              }}
            >
              Remove line
            </Button>
          </>
        }
      />
    </div>
  );
}
