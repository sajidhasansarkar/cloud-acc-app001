"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, AlertTriangle, ExternalLink, Pencil, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { markAIReviewReadyAction } from "@/actions/ai-review";

type ReviewData = any;

function statusVariant(value: string) {
  if (value === "READY_FOR_POSTING" || value === "MATCH" || value === "HIGH") return "success" as const;
  if (value === "PENDING_REVIEW" || value === "REVIEW_REQUIRED" || value === "MEDIUM") return "warning" as const;
  if (value === "NEEDS_CORRECTION" || value === "MISMATCH" || value === "LOW" || value === "REJECTED") return "danger" as const;
  return "default" as const;
}

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-sm font-medium text-ink-900">{value || "—"}</p>
    </div>
  );
}

export function ReviewReconciliation({ data }: { data: ReviewData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const { company, candidate, review, latestSuggestion, draft, balance, checks, checklist, canMarkReady, displayReviewStatus, blockingWarnings } = data;

  function markReady() {
    startTransition(async () => {
      const result = await markAIReviewReadyAction(company.id, candidate.documentId, candidate.id);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Review marked Ready for Posting. Nothing was posted.", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Human Review Status</CardTitle>
              <CardDescription>READY_FOR_POSTING is a review state only. It does not post or approve an accounting entry automatically.</CardDescription>
            </div>
            <Badge variant={statusVariant(displayReviewStatus)}>{displayReviewStatus.replaceAll("_", " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={`/companies/${company.id}/documents/${candidate.documentId}`} className="inline-flex">
            <Button variant="outline"><FileText className="h-4 w-4" />Source Document</Button>
          </Link>
          <a
            href={`/api/companies/${company.id}/documents/${candidate.documentId}/file`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex"
          >
            <Button variant="outline"><ExternalLink className="h-4 w-4" />Inspect Original File</Button>
          </a>
          {draft ? (
            <Link href={`/companies/${company.id}/journal-entries/${draft.id}/edit`} className="inline-flex">
              <Button variant="outline"><Pencil className="h-4 w-4" />Edit Draft</Button>
            </Link>
          ) : null}
          <Button disabled={!canMarkReady || pending} onClick={markReady}>
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Checking…" : "Mark Ready for Posting"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Source Transaction</CardTitle>
            <CardDescription>Read-only normalized source data.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Source Document" value={candidate.document.originalFileName} />
            <Field label="Page Number" value={candidate.sourcePageNumber} />
            <Field label="Sheet Name" value={candidate.sourceSheetName} />
            <Field label="Row Number" value={candidate.sourceRowNumber ?? candidate.sourceRowReference} />
            <Field label="Date" value={date(candidate.date)} />
            <Field label="Description" value={candidate.description} />
            <Field label="Reference" value={candidate.reference} />
            <Field label="Amount" value={display(candidate.amount?.toString())} />
            <Field label="Debit" value={display(candidate.debit?.toString())} />
            <Field label="Credit" value={display(candidate.credit?.toString())} />
            <Field label="Currency" value={candidate.currency} />
            <Field label="Extraction Confidence" value={<Badge variant={statusVariant(candidate.confidence)}>{candidate.confidence}</Badge>} />
            <div className="col-span-2">
              <p className="text-xs text-ink-500">Warnings</p>
              {Array.isArray(candidate.warnings) && candidate.warnings.length ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
                  {candidate.warnings.map((warning: unknown, index: number) => <li key={index}>{String(warning)}</li>)}
                </ul>
              ) : <p className="text-sm text-ink-500">None</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>2. AI Suggestion</CardTitle>
                <CardDescription>Immutable AI output kept separate from human decisions.</CardDescription>
              </div>
              {latestSuggestion ? <Badge variant={statusVariant(latestSuggestion.confidence)}>{latestSuggestion.confidence}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestSuggestion ? (
              <>
                <div className="rounded-md border border-ink-100 bg-surface-muted p-3">
                  <p className="text-xs font-semibold text-ink-900">Suggested Account</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">
                    {latestSuggestion.suggestedAccount ? `${latestSuggestion.suggestedAccount.code} — ${latestSuggestion.suggestedAccount.name}` : "NO_SUITABLE_ACCOUNT"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Account Code" value={latestSuggestion.suggestedAccount?.code} />
                  <Field label="Account Name" value={latestSuggestion.suggestedAccount?.name} />
                  <Field label="Suggested Debit" value={latestSuggestion.suggestedDebit} />
                  <Field label="Suggested Credit" value={latestSuggestion.suggestedCredit} />
                  <Field label="Suggested Amount" value={latestSuggestion.suggestedAmount} />
                  <Field label="Confidence" value={latestSuggestion.confidence} />
                </div>
                <div>
                  <p className="text-xs text-ink-500">Explanation</p>
                  <p className="mt-1 text-sm text-ink-700">{latestSuggestion.explanation}</p>
                </div>
                {Array.isArray(latestSuggestion.alternatives) && latestSuggestion.alternatives.length ? (
                  <div>
                    <p className="text-xs font-semibold text-ink-800">Alternative Accounts</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-ink-600">
                      {latestSuggestion.alternatives.map((item: any) => <li key={item.accountId}>{item.code} — {item.name} · {item.confidence}</li>)}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(latestSuggestion.warnings) && latestSuggestion.warnings.length ? (
                  <div className="rounded-md border border-pending/20 bg-pending/5 p-3">
                    <p className="flex items-center gap-1 text-xs font-semibold text-ink-900"><AlertTriangle className="h-3.5 w-3.5" />Warnings</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
                      {latestSuggestion.warnings.map((warning: unknown, index: number) => <li key={index}>{String(warning)}</li>)}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : <p className="text-sm text-ink-500">No AI suggestion is available.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Draft Journal Entry</CardTitle>
            <CardDescription>Existing Draft only. Use the existing Journal Entry editor for corrections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {draft ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Entry Number / ID" value={draft.entryNumber} />
                  <Field label="Date" value={date(draft.entryDate)} />
                  <Field label="Description" value={draft.description} />
                  <Field label="Reference" value={draft.reference} />
                  <Field label="Fiscal Year" value={draft.fiscalYear.name} />
                  <Field label="Accounting Period" value={draft.accountingPeriod.name} />
                  <Field label="Status" value={draft.status} />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="border-b border-ink-100">
                      <tr><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">Account</th><th className="px-2 py-2 text-left">Description</th><th className="px-2 py-2 text-right">Debit</th><th className="px-2 py-2 text-right">Credit</th></tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {draft.lines.map((line: any) => (
                        <tr key={line.id}>
                          <td className="px-2 py-2">{line.lineOrder}</td>
                          <td className="px-2 py-2">{line.account.code} — {line.account.name}</td>
                          <td className="px-2 py-2">{line.description || "—"}</td>
                          <td className="px-2 py-2 text-right">{line.debit.toString()}</td>
                          <td className="px-2 py-2 text-right">{line.credit.toString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-md bg-surface-muted p-3 text-xs">
                  <Field label="Total Debit" value={balance.totalDebit.toString()} />
                  <Field label="Total Credit" value={balance.totalCredit.toString()} />
                  <Field label="Difference" value={balance.difference.toString()} />
                </div>
                <Badge variant={balance.balanced ? "success" : "danger"}>{balance.balanced ? "BALANCED" : "NOT BALANCED"}</Badge>
              </>
            ) : (
              <p className="text-sm text-ink-500">No Draft Journal Entry exists yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation Summary</CardTitle>
          <CardDescription>Source vs AI vs Draft comparison. Nothing is silently changed.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-ink-100">
              <tr><th className="px-3 py-2 text-left">Check</th><th className="px-3 py-2 text-left">Source / AI</th><th className="px-3 py-2 text-left">Draft</th><th className="px-3 py-2 text-left">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {checks.map((check: any) => (
                <tr key={check.label}>
                  <td className="px-3 py-2 font-medium">{check.label}</td>
                  <td className="px-3 py-2">{check.source}</td>
                  <td className="px-3 py-2">{check.draft}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(check.result)}>{check.result.replaceAll("_", " ")}</Badge>
                    {check.note ? <div className="mt-1 text-[10px] text-ink-500">{check.note}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {blockingWarnings.length ? (
        <Card>
          <CardHeader><CardTitle>Blocking Warnings</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm text-negative">
              {blockingWarnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Review Checklist</CardTitle>
          <CardDescription>The state is derived from actual source, Draft, validation, and human-review data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((item: any) => (
            <div key={item.key} className="flex items-center justify-between rounded border border-ink-100 px-3 py-2 text-sm">
              <span>{item.label}</span>
              <Badge variant={item.complete ? "success" : "danger"}>{item.complete ? "✓ Complete" : "Required"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Human Review & Audit Trail</CardTitle>
          <CardDescription>AI Suggestion + Human Decision + Final Draft remain separately traceable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Human Status" value={displayReviewStatus.replaceAll("_", " ")} />
            <Field label="Decision" value={review?.decision} />
            <Field label="Reviewed By" value={review?.reviewedBy?.name} />
            <Field label="Reviewed At" value={date(review?.reviewedAt)} />
            <Field label="Human Account" value={review?.humanAccount ? `${review.humanAccount.code} — ${review.humanAccount.name}` : null} />
            <Field label="Human Notes / Correction" value={review?.humanNotes} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-ink-100"><tr><th className="px-2 py-2 text-left">Action</th><th className="px-2 py-2 text-left">Previous</th><th className="px-2 py-2 text-left">New</th><th className="px-2 py-2 text-left">Correction</th><th className="px-2 py-2 text-left">By</th><th className="px-2 py-2 text-left">At</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {(review?.audits ?? []).map((audit: any) => (
                  <tr key={audit.id}>
                    <td className="px-2 py-2">{audit.action}</td>
                    <td className="px-2 py-2">{audit.previousHumanReviewStatus?.replaceAll("_", " ") || "—"}</td>
                    <td className="px-2 py-2">{audit.newHumanReviewStatus?.replaceAll("_", " ") || "—"}</td>
                    <td className="px-2 py-2">{audit.relevantCorrection || "—"}</td>
                    <td className="px-2 py-2">{audit.user?.name || "—"}</td>
                    <td className="px-2 py-2">{date(audit.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
