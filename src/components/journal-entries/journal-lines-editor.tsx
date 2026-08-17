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
import type { Account } from "@prisma/client";

/**
 * Journal Lines editor (Phase 4A-3A, spec sections 1-13).
 *
 * UI-only: this component enforces the same-line "debit OR credit, not
 * both" rule and non-negative amounts client-side (spec section 9), but
 * does NOT enforce that lines are complete or that the entry balances —
 * both are explicitly deferred to Phase 4A-3B, and drafts must remain
 * saveable with no lines, incomplete lines, or unbalanced lines (spec
 * section 13). Every line's amounts still ultimately pass through
 * validateLineAmounts on the server (src/accounting/journal-entries.ts),
 * which is the real source of truth.
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
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) || n === 0;
}

// Sanitizes a numeric amount field: strips anything that isn't a digit or
// a single decimal point, so a minus sign can never be typed in the first
// place (spec sections 7-8: negative amounts not allowed). Kept as a
// string throughout — see JournalLineDraft.debit/credit above.
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  }
  return v;
}

// Decimal(19,4)-scaled integer summation so the displayed totals never
// drift from repeated float addition (spec sections 7-8) — this is a
// convenience running total for the editor only; the authoritative sum
// is computed server-side with Prisma.Decimal.
const SCALE = 10_000;
function sumAmounts(values: string[]): string {
  const totalScaled = values.reduce((acc, v) => {
    const n = Number(v);
    return acc + (Number.isFinite(n) ? Math.round(n * SCALE) : 0);
  }, 0);
  return (totalScaled / SCALE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const totalDebit = sumAmounts(lines.map((l) => l.debit));
  const totalCredit = sumAmounts(lines.map((l) => l.credit));

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
                  {bothEntered || incomplete ? (
                    <tr>
                      <td colSpan={7} className="px-4 pb-2 pt-0">
                        {bothEntered ? (
                          <p className="text-xs text-negative">
                            A line can only have a debit or a credit amount, not both.
                          </p>
                        ) : (
                          <p className="text-xs text-ink-400">
                            Incomplete line — enter a debit or a credit amount.
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end gap-6 border-t border-ink-100 bg-surface-muted px-4 py-2 text-sm">
            <span className="text-ink-500">Total Debit: <span className="font-mono text-ink-800">{totalDebit}</span></span>
            <span className="text-ink-500">Total Credit: <span className="font-mono text-ink-800">{totalCredit}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
