"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Edit3, FileText, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { acceptAIReviewAction, editAIReviewAction, generateAIReviewAction, getAIReviewAccountsAction, getAIReviewAction, rejectAIReviewAction } from "@/actions/ai-review";
import { createDraftJournalEntryFromSuggestionAction } from "@/actions/journal-entry-drafts";

type ReviewStatus = "NOT_REVIEWED" | "READY" | "REVIEWING" | "REVIEWED" | "NEEDS_HUMAN_REVIEW" | "FAILED";
type Account = { id: string; code: string; name: string; type: string };
type Review = {
  status: ReviewStatus;
  decision: "ACCEPTED" | "REJECTED" | "EDITED" | null;
  provider: string | null;
  model: string | null;
  contextVersion: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | Date | null;
  humanAccount: Account | null;
  humanDebit: string | null;
  humanCredit: string | null;
  humanAmount: string | null;
  humanNotes: string | null;
  suggestions: Array<{
    id: string;
    provider: string;
    model: string | null;
    contextVersion: string;
    suggestedAccount: Account | null;
    suggestedDebit: string | null;
    suggestedCredit: string | null;
    suggestedAmount: string | null;
    explanation: string;
    confidence: string;
    warnings: unknown;
    alternatives: unknown;
  }>;
};

function badgeVariant(value: string) {
  if (value === "HIGH" || value === "ACCEPTED") return "success" as const;
  if (value === "MEDIUM" || value === "NEEDS_HUMAN_REVIEW") return "warning" as const;
  if (value === "LOW" || value === "FAILED" || value === "REJECTED") return "danger" as const;
  return "default" as const;
}

function listValues(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export function AIReviewPanel({
  companyId,
  documentId,
  candidateId,
  status,
  source,
}: {
  companyId: string;
  documentId: string;
  candidateId: string;
  status: ReviewStatus;
  source: { date: string | null; description: string | null; reference: string | null; debit: string | null; credit: string | null; amount: string | null; currency: string | null; sourceLabel: string; };
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [review, setReview] = useState<Review | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Phase 4B-6: Create Draft Journal Entry from an accepted AI suggestion.
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftPending, startDraftTransition] = useTransition();
  const [needsDateConfirmation, setNeedsDateConfirmation] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState("");
  const [duplicateDraftId, setDuplicateDraftId] = useState<string | null>(null);
  const [draftErrorMessage, setDraftErrorMessage] = useState<string | null>(null);

  function loadReview(afterGenerate = false) {
    startTransition(async () => {
      const result = await getAIReviewAction(companyId, documentId, candidateId);
      if (!result.ok) { toast(result.error, "error"); return; }
      setReview(result.review as unknown as Review);
      setCurrentStatus(result.review.status as ReviewStatus);
      const latest = result.review.suggestions[0];
      if (latest) {
        setAccountId(latest.suggestedAccount?.id ?? "");
        setDebit(latest.suggestedDebit ?? "");
        setCredit(latest.suggestedCredit ?? "");
        setAmount(latest.suggestedAmount ?? "");
      }
      if (afterGenerate) toast("AI suggestion is ready for human review.", "success");
      setOpen(true);
    });
  }

  function runReview() {
    setCurrentStatus("REVIEWING");
    startTransition(async () => {
      const result = await generateAIReviewAction(companyId, documentId, candidateId);
      if (!result.ok) { setCurrentStatus("FAILED"); toast(result.error, "error"); return; }
      setCurrentStatus(result.status);
      loadReview(true);
    });
  }

  function openPanel() {
    loadReview();
  }

  function accept() {
    startTransition(async () => {
      const result = await acceptAIReviewAction(companyId, documentId, candidateId);
      if (!result.ok) { toast(result.error, "error"); return; }
      toast("AI suggestion accepted for human review. No Journal Entry was created.", "success");
      loadReview();
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectAIReviewAction(companyId, documentId, candidateId, notes);
      if (!result.ok) { toast(result.error, "error"); return; }
      setRejectOpen(false);
      toast("AI suggestion rejected. Source data remains unchanged.", "success");
      loadReview();
    });
  }

  function openEdit() {
    startTransition(async () => {
      const result = await getAIReviewAccountsAction(companyId);
      if (!result.ok) { toast(result.error, "error"); return; }
      setAccounts(result.accounts);
      setEditOpen(true);
    });
  }

  function edit() {
    startTransition(async () => {
      const result = await editAIReviewAction(companyId, documentId, candidateId, { accountId: accountId || null, debit: debit || null, credit: credit || null, amount: amount || null, notes: notes || null });
      if (!result.ok) { toast(result.error, "error"); return; }
      setEditOpen(false);
      toast("Human override saved. No Journal Entry was created.", "success");
      loadReview();
    });
  }

  function openCreateDraft() {
    setDraftErrorMessage(null);
    setDuplicateDraftId(null);
    setNeedsDateConfirmation(false);
    setConfirmedDate(source.date ? source.date.slice(0, 10) : "");
    setDraftOpen(true);
  }

  function createDraft() {
    startDraftTransition(async () => {
      const result = await createDraftJournalEntryFromSuggestionAction(
        companyId,
        documentId,
        candidateId,
        needsDateConfirmation ? confirmedDate : undefined
      );

      if (result.ok) {
        setDraftOpen(false);
        toast("Draft Journal Entry created successfully.", "success");
        router.push(`/companies/${companyId}/journal-entries/${result.entry.id}`);
        return;
      }

      if (result.code === "DATE_CONFIRMATION_REQUIRED") {
        setNeedsDateConfirmation(true);
        setDraftErrorMessage(null);
        return;
      }

      if (result.code === "DUPLICATE_DRAFT" && result.existingJournalEntryId) {
        setDuplicateDraftId(result.existingJournalEntryId);
        setDraftErrorMessage(result.error);
        return;
      }

      setDraftErrorMessage(result.error);
      toast(result.error, "error");
    });
  }

  const latest = review?.suggestions?.[0];
  const alternatives = latest ? (Array.isArray(latest.alternatives) ? latest.alternatives as Array<{ accountId: string; code: string; name: string; confidence: string }> : []) : [];
  const warnings = latest ? listValues(latest.warnings) : [];

  return (
    <>
      <div className="min-w-48 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant(currentStatus)}>{currentStatus.replaceAll("_", " ")}</Badge>
          {review?.decision ? <Badge variant={badgeVariant(review.decision)}>{review.decision}</Badge> : null}
        </div>
        {latest ? <div className="text-[10px] text-ink-500">{latest.suggestedAccount ? `${latest.suggestedAccount.code} — ${latest.suggestedAccount.name}` : "NO_SUITABLE_ACCOUNT"} · {latest.confidence}</div> : null}
        {currentStatus === "NOT_REVIEWED" || currentStatus === "READY" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={runReview}><Sparkles className="h-3.5 w-3.5" />{pending ? "Reviewing…" : "Run AI Review"}</Button>
        ) : null}
        {currentStatus === "FAILED" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={runReview}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
        ) : null}
        {currentStatus === "REVIEWING" ? <span className="text-xs text-ink-500">Reviewing…</span> : null}
        {currentStatus === "NEEDS_HUMAN_REVIEW" || currentStatus === "REVIEWED" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={openPanel}>View Review</Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="AI Transaction Review" description="AI output is a suggestion only. Human review is mandatory and no accounting entry is created here.">
        <div className="space-y-4">
          <div className="rounded-md border border-ink-100 p-3 text-xs">
            <p className="font-semibold text-ink-900">Source Data</p>
            <p className="mt-1 text-ink-600">{source.sourceLabel}</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <span>Date: {source.date ? source.date.slice(0, 10) : "—"}</span>
              <span>Reference: {source.reference || "—"}</span>
              <span>Description: {source.description || "—"}</span>
              <span>Currency: {source.currency || "—"}</span>
              <span>Debit: {source.debit || "—"}</span>
              <span>Credit: {source.credit || "—"}</span>
              <span>Amount: {source.amount || "—"}</span>
            </div>
          </div>
          {latest ? (
            <>
              <div className="rounded-md border border-ink-100 bg-surface-muted p-3 text-xs">
                <p className="font-semibold text-ink-900">AI Suggestion</p>
                <p className="mt-1 text-ink-700">Account: {latest.suggestedAccount ? `${latest.suggestedAccount.code} — ${latest.suggestedAccount.name}` : "NO_SUITABLE_ACCOUNT"}</p>
                <p className="text-ink-700">Debit: {latest.suggestedDebit ?? "—"} · Credit: {latest.suggestedCredit ?? "—"} · Amount: {latest.suggestedAmount ?? "—"}</p>
                <p className="mt-2 text-ink-600">{latest.explanation}</p>
                <div className="mt-2"><Badge variant={badgeVariant(latest.confidence)}>{latest.confidence} confidence</Badge></div>
              </div>
              {alternatives.length ? <div><p className="text-xs font-semibold text-ink-800">Alternative accounts</p><ul className="mt-1 list-disc pl-5 text-xs text-ink-600">{alternatives.map((item) => <li key={item.accountId}>{item.code} — {item.name} · {item.confidence}</li>)}</ul></div> : null}
              {warnings.length ? <div className="rounded-md border border-pending/20 bg-pending/5 p-3 text-xs text-ink-700"><p className="font-semibold">Warnings</p><ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
              {review?.decision ? <div className="rounded-md border border-positive/20 bg-positive/5 p-3 text-xs text-ink-700">Human decision: <strong>{review.decision}</strong>{review.reviewedBy ? ` by ${review.reviewedBy.name}` : ""}.</div> : null}
              <div className="flex flex-wrap gap-2">
                {!review?.decision ? <>
                  <Button size="sm" disabled={pending || latest.confidence === "LOW"} onClick={accept}><Check className="h-3.5 w-3.5" />Accept</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejectOpen(true)}><X className="h-3.5 w-3.5" />Reject</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={openEdit}><Edit3 className="h-3.5 w-3.5" />Edit</Button>
                </> : null}
                {review?.decision === "ACCEPTED" ? (
                  <Button size="sm" disabled={pending} onClick={openCreateDraft}>
                    <FileText className="h-3.5 w-3.5" />
                    Create Draft Journal Entry
                  </Button>
                ) : null}
              </div>
            </>
          ) : <p className="text-sm text-ink-500">No structured AI suggestion is available.</p>}
        </div>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen} title="Reject AI Suggestion" description="The normalized source data will remain unchanged.">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional review note" />
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={reject}>Reject</Button></div>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit AI Suggestion" description="This creates a human override while preserving the original AI suggestion and audit history.">
        <div className="space-y-3">
          <div><label className="text-xs text-ink-600">Account</label><Select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">No account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</Select><p className="mt-1 text-[10px] text-ink-400">Use the current company Chart of Accounts.</p></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-ink-600">Debit</label><Input value={debit} onChange={(event) => setDebit(event.target.value)} inputMode="decimal" /></div><div><label className="text-xs text-ink-600">Credit</label><Input value={credit} onChange={(event) => setCredit(event.target.value)} inputMode="decimal" /></div></div>
          <div><label className="text-xs text-ink-600">Amount</label><Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></div>
          <div><label className="text-xs text-ink-600">Review notes</label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={pending} onClick={edit}>Save Human Override</Button></div>
      </Dialog>

      <Dialog
        open={draftOpen}
        onOpenChange={setDraftOpen}
        title="Create Draft Journal Entry"
        description="This creates a DRAFT Journal Entry from the accepted AI suggestion. It is never automatically posted — you can review and edit it afterward."
      >
        <div className="space-y-4">
          {duplicateDraftId ? (
            <div className="rounded-md border border-pending/20 bg-pending/5 p-3 text-xs text-ink-700">
              <p className="font-semibold">{draftErrorMessage}</p>
              <p className="mt-1">A Draft Journal Entry already exists for this transaction.</p>
              <Link
                href={`/companies/${companyId}/journal-entries/${duplicateDraftId}`}
                className="mt-2 inline-block text-xs font-medium text-ink-900 underline"
              >
                Open existing Draft
              </Link>
            </div>
          ) : (
            <>
              {review ? (
                <div className="rounded-md border border-ink-100 bg-surface-muted p-3 text-xs text-ink-700">
                  <p className="font-semibold text-ink-900">Accepted values</p>
                  <p className="mt-1">Account: {review.humanAccount ? `${review.humanAccount.code} — ${review.humanAccount.name}` : "—"}</p>
                  <p>Debit: {review.humanDebit ?? "—"} · Credit: {review.humanCredit ?? "—"}</p>
                  <p>Description: {source.description || "—"}</p>
                </div>
              ) : null}

              {needsDateConfirmation ? (
                <div>
                  <Label htmlFor="draft-confirm-date">Confirm transaction date</Label>
                  <p className="mt-1 text-[10px] text-ink-500">
                    The normalized transaction date is missing or low-confidence. Confirm the date to use before creating the Draft.
                  </p>
                  <Input
                    id="draft-confirm-date"
                    type="date"
                    className="mt-1"
                    value={confirmedDate}
                    onChange={(event) => setConfirmedDate(event.target.value)}
                  />
                </div>
              ) : null}

              {draftErrorMessage ? (
                <p className="text-xs text-negative">{draftErrorMessage}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraftOpen(false)}>Cancel</Button>
                <Button
                  disabled={draftPending || (needsDateConfirmation && !confirmedDate)}
                  onClick={createDraft}
                >
                  {draftPending ? "Creating…" : needsDateConfirmation ? "Confirm Date & Create" : "Create Draft"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
