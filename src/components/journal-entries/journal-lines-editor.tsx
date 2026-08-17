"use client";

import * as React from "react";
import { useId } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  accountId: string;
  description: string;
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
    description: "",
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
  lines,
  onChange,
  disabled,
}: {
  accounts: Pick<Account, "id" | "code" | "name" | "isActive">[];
  lines: JournalLineDraft[];
  onChange: (lines: JournalLineDraft[]) => void;
  disabled?: boolean;
}) {
  const headingId = useId();

  function updateLine(key: string, patch: Partial<JournalLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function handleDebitChange(key: string, raw: string) {
    const value = sanitizeAmount(raw);
    const hasAmount = !isZeroOrEmpty(value);
    updateLine(key, { debit: value, credit: hasAmount ? "" : lines.find((l) => l.key === key)?.credit ?? "" });
  }

  function handleCreditChange(key: string, raw: string) {
    const value = sanitizeAmount(raw);
    const hasAmount = !isZeroOrEmpty(value);
    updateLine(key, { credit: value, debit: hasAmount ? "" : lines.find((l) => l.key === key)?.debit ?? "" });
  }

  function addLine() {
    onChange([...lines, newJournalLineDraft()]);
  }

  function removeLine(key: string) {
    // Line numbers are never stored on the draft itself — the row's
    // position in this array is its line number (spec section 11:
    // removing a line recalculates the numbers that follow it), so
    // removing just means dropping it from the array.
    onChange(lines.filter((line) => line.key !== key));
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
                <TableHead className="w-10">#</TableHead>
                <TableHead className="min-w-[220px]">Account</TableHead>
                <TableHead className="min-w-[160px]">Description</TableHead>
                <TableHead className="min-w-[140px]">Reference</TableHead>
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
                  <TableRow>
                    <TableCell className="text-ink-500">{index + 1}</TableCell>
                    <TableCell>
                      <AccountPicker
                        accounts={accounts}
                        value={line.accountId}
                        onChange={(accountId) => updateLine(line.key, { accountId })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        placeholder="Line description"
                        disabled={disabled}
                        aria-label={`Line ${index + 1} description`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.reference}
                        onChange={(e) => updateLine(line.key, { reference: e.target.value })}
                        placeholder="Invoice #, receipt #…"
                        disabled={disabled}
                        aria-label={`Line ${index + 1} reference`}
                      />
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
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={disabled}
                        aria-label={`Remove line ${index + 1}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-400 hover:bg-negative/10 hover:text-negative disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                  {lineErrors[index] ? (
                    <tr>
                      <td colSpan={7} className="px-4 pb-2 pt-0">
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
    </div>
  );
}
