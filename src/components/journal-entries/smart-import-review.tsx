"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, AlertTriangle, ArrowUpRight, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { confirmSmartImportAction } from "@/actions/smart-import";
import type { getSmartImportReviewData } from "@/documents/smart-import";

type ReviewData = NonNullable<Awaited<ReturnType<typeof getSmartImportReviewData>>>;
type ReviewRow = ReviewData["rows"][number];

function confidenceVariant(confidence: string) {
  if (confidence === "HIGH") return "success" as const;
  if (confidence === "MEDIUM") return "warning" as const;
  return "danger" as const;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

export function SmartImportReview({
  companyId,
  documentId,
  data,
}: {
  companyId: string;
  documentId: string;
  data: ReviewData;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // A row is included by default only if the AI proposed an account and it
  // isn't a possible duplicate — everything else needs a human look first,
  // matching Smart Import's existing "don't guess" rule.
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      data.rows.map((row) => [row.candidateId, Boolean(row.suggestion?.accountId) && !row.possibleDuplicate && !row.alreadyCreatedJournalEntryId])
    )
  );
  const [accountOverrides, setAccountOverrides] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: { candidateId: string; journalEntryId: string; description: string | null; entryDate: string; amount: string }[]; needsAttention: { candidateId: string; description: string | null; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(() => Object.values(included).filter(Boolean).length, [included]);

  function accountFor(row: ReviewRow) {
    return accountOverrides[row.candidateId] ?? row.suggestion?.accountId ?? "";
  }

  async function submit() {
    const confirmations = data.rows
      .filter((row) => included[row.candidateId])
      .map((row) => {
        const accountId = accountFor(row);
        return accountId ? { candidateId: row.candidateId, accountId } : { candidateId: row.candidateId };
      });
    if (!confirmations.length) {
      setError("Select at least one transaction to create.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await confirmSmartImportAction(companyId, documentId, confirmations);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
      if (outcome.created.length) {
        toast(`${outcome.created.length} journal entr${outcome.created.length === 1 ? "y" : "ies"} created.`, "success");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create journal entries. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        {result.created.length ? (
          <div className="rounded-lg border border-ink-100 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <CheckCircle2 className="h-4 w-4 text-positive" />
              {result.created.length} draft journal entr{result.created.length === 1 ? "y" : "ies"} created
            </div>
            <ul className="mt-3 divide-y divide-ink-100">
              {result.created.map((entry) => (
                <li key={entry.journalEntryId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{entry.description || "Untitled entry"}</p>
                    <p className="text-xs text-ink-500">{formatDate(entry.entryDate)} · {entry.amount}</p>
                  </div>
                  <Link href={`/companies/${companyId}/journal-entries/${entry.journalEntryId}/edit`} className="inline-flex shrink-0 items-center gap-1 text-ledger-600 underline">
                    Edit <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result.needsAttention.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {result.needsAttention.length} transaction{result.needsAttention.length === 1 ? "" : "s"} could not be created
            </div>
            <ul className="mt-3 space-y-2">
              {result.needsAttention.map((item) => (
                <li key={item.candidateId} className="text-sm">
                  <p className="font-medium text-ink-800">{item.description || "Untitled transaction"}</p>
                  <p className="text-xs text-ink-600">{item.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => router.push(`/companies/${companyId}/journal-entries/new`)}>
            Import another file
          </Button>
          <Button variant="primary" type="button" onClick={() => router.push(`/companies/${companyId}/journal-entries`)}>
            Go to Journal Entries
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
        <table className="min-w-full text-xs">
          <thead className="border-b border-ink-100 bg-surface-muted">
            <tr>
              <th className="w-10 px-3 py-3 text-left"></th>
              <th className="px-3 py-3 text-left">Date</th>
              <th className="px-3 py-3 text-left">Description</th>
              <th className="px-3 py-3 text-left">Amount</th>
              <th className="px-3 py-3 text-left">Proposed Account</th>
              <th className="px-3 py-3 text-left">Confidence</th>
              <th className="px-3 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.rows.map((row) => {
              const disabled = Boolean(row.alreadyCreatedJournalEntryId);
              return (
                <tr key={row.candidateId} className={disabled ? "opacity-50" : undefined}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(included[row.candidateId])}
                      disabled={disabled}
                      onChange={(e) => setIncluded((prev) => ({ ...prev, [row.candidateId]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-3 py-3">
                    <p className="max-w-[220px] truncate font-medium text-ink-800">{row.description || "Untitled transaction"}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{row.amount ?? "—"} {row.currency ?? ""}</td>
                  <td className="px-3 py-3">
                    <Select
                      className="min-w-[220px]"
                      value={accountFor(row)}
                      disabled={disabled}
                      onChange={(e) => {
                        setAccountOverrides((prev) => ({ ...prev, [row.candidateId]: e.target.value }));
                        if (e.target.value) setIncluded((prev) => ({ ...prev, [row.candidateId]: true }));
                      }}
                    >
                      <option value="">— Select account —</option>
                      {data.accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                      ))}
                    </Select>
                    {row.suggestion?.explanation ? (
                      <p className="mt-1 max-w-[240px] text-[11px] text-ink-500">{row.suggestion.explanation}</p>
                    ) : row.suggestionError ? (
                      <p className="mt-1 max-w-[240px] text-[11px] text-negative">{row.suggestionError}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {row.suggestion ? <Badge variant={confidenceVariant(row.suggestion.confidence)}>{row.suggestion.confidence}</Badge> : <Badge variant="default">No suggestion</Badge>}
                  </td>
                  <td className="px-3 py-3">
                    {row.alreadyCreatedJournalEntryId ? (
                      <Link href={`/companies/${companyId}/journal-entries/${row.alreadyCreatedJournalEntryId}/edit`} className="text-ledger-600 underline">Already created</Link>
                    ) : row.possibleDuplicate ? (
                      <span className="text-amber-600">Possible duplicate</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-700" role="alert">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">{selectedCount} of {data.rows.length} transaction{data.rows.length === 1 ? "" : "s"} selected. Every row needs an account before it can be created.</p>
        <Button variant="primary" type="button" disabled={submitting || !selectedCount} onClick={() => void submit()}>
          <Sparkles className="h-4 w-4" />
          {submitting ? "Creating…" : `Create ${selectedCount || ""} Journal Entr${selectedCount === 1 ? "y" : "ies"}`}
        </Button>
      </div>
    </div>
  );
}
