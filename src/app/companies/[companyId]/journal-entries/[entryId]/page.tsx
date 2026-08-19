import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil, ListChecks } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { prisma } from "@/lib/prisma";
import { getJournalEntry, validateJournalEntryBalance, validateJournalEntryForReview, validateReadyForPostingJournalEntry, validateDraftJournalEntry } from "@/accounting/journal-entries";
import { canManageJournalEntries, canReviewJournalEntries } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JournalEntryStatusBadge } from "@/components/journal-entries/journal-entry-status-badge";
import { JournalEntryBalanceSummary } from "@/components/journal-entries/journal-entry-balance-summary";
import { JournalEntryDeleteAction } from "@/components/journal-entries/journal-entry-delete-action";
import { JournalEntryLinesManager } from "@/components/journal-entries/journal-entry-lines-manager";
import { JournalEntryReviewActions } from "@/components/journal-entries/journal-entry-review-actions";
import { DraftJournalRegenerateAction } from "@/components/journal-entries/draft-journal-regenerate-action";
import { JournalEntryValidationSummary } from "@/components/journal-entries/journal-entry-validation-summary";
import { JOURNAL_ENTRY_SOURCE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { JournalEntrySourceType } from "@prisma/client";

export const metadata = { title: "Journal Entry — Ledger" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-sm font-medium text-ink-900">{value || "—"}</p>
    </div>
  );
}

export default async function JournalEntryDetailPage({
  params,
}: {
  params: { companyId: string; entryId: string };
}) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const basePath = `/companies/${company.id}/journal-entries`;

  // Ownership chain re-verified here too: entryId from the URL must belong
  // to companyId, which must belong to the caller's organization. A bad
  // or cross-company/cross-organization id 404s rather than leaking
  // whether the id exists elsewhere.
  const entry = await getJournalEntry(organization.id, company.id, params.entryId);
  if (!entry) {
    notFound();
  }

  const canManage = canManageJournalEntries(role);
  const canReview = canReviewJournalEntries(role);
  // The balance summary is calculated from the persisted journal lines with
  // Prisma.Decimal. No display value is derived from JavaScript Number.
  const balance = await validateJournalEntryBalance(entry.id);
  const validLineCount = entry.lines.filter((line) =>
    (line.debit.gt(0) ? 1 : 0) + (line.credit.gt(0) ? 1 : 0) === 1
  ).length;
  const structurallyValid = validLineCount >= 2;
  const balanced = structurallyValid && balance.balanced;
  const balanceMessage = balanced
    ? null
    : !structurallyValid
      ? "At least two valid journal lines are required."
      : balance.difference.gt(0)
        ? "Debit exceeds Credit"
        : balance.difference.lt(0)
          ? "Credit exceeds Debit"
          : "Journal entry is not balanced.";
  const reviewValidation = await validateJournalEntryForReview(organization.id, entry.id);
  const draftValidation = await validateDraftJournalEntry(organization.id, entry.id);
  const reviewErrors = reviewValidation.valid ? [] : reviewValidation.errors;
  const readyCheck = (entry.status === "READY_TO_POST" || entry.status === "READY_FOR_POSTING")
    ? await validateReadyForPostingJournalEntry(organization.id, company.id, entry.id)
    : null;
  const approvalHistory = await prisma.documentAuditEvent.findMany({
    where: { organizationId: organization.id, companyId: company.id, details: { path: ["journalEntryId"], equals: entry.id } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true, action: true, createdAt: true, details: true,
      user: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to journal entries
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">{entry.entryNumber}</h1>
            <JournalEntryStatusBadge status={entry.status} />
          </div>
          <p className="text-sm text-ink-500">{company.displayName}</p>
        </div>

        {(canManage || canReview) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canManage && entry.status === "DRAFT" ? (
              <Link href={`${basePath}/${entry.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {canManage && entry.status === "DRAFT" && entry.transactionCandidate ? (
              <DraftJournalRegenerateAction journalEntryId={entry.id} modified={entry.version > 1} />
            ) : null}
            {canReview && (entry.status === "DRAFT" || entry.status === "IN_REVIEW" || entry.status === "NEEDS_REVIEW" || entry.status === "NOT_BALANCED" || entry.status === "BALANCED" || entry.status === "APPROVED" || entry.status === "READY_TO_POST" || entry.status === "REJECTED" || entry.status === "READY_FOR_POSTING") ? (
              <JournalEntryReviewActions
                companyId={company.id}
                journalEntryId={entry.id}
                status={entry.status}
                version={entry.version}
                totalDebit={reviewValidation.totalDebit.toFixed(4)}
                totalCredit={reviewValidation.totalCredit.toFixed(4)}
                difference={reviewValidation.difference.toFixed(4)}
                blockingErrors={draftValidation?.findings.filter((finding) => finding.severity === "ERROR").map((finding) => finding.message) ?? reviewErrors}
              />
            ) : null}
            {canManage && entry.status === "DRAFT" ? (
              <JournalEntryDeleteAction
                companyId={company.id}
                journalEntryId={entry.id}
                entryNumber={entry.entryNumber}
                status={entry.status}
                version={entry.version}
                totalDebit={reviewValidation.totalDebit.toFixed(4)}
                totalCredit={reviewValidation.totalCredit.toFixed(4)}
                difference={reviewValidation.difference.toFixed(4)}
                blockingErrors={draftValidation?.findings.filter((finding) => finding.severity === "ERROR").map((finding) => finding.message) ?? reviewErrors}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entry Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Entry Number" value={entry.entryNumber} />
          <Field label="Company" value={company.displayName} />
          <Field label="Currency" value={company.currency} />
          <Field label="Entry Date" value={formatDate(entry.entryDate)} />
          <Field label="Fiscal Year" value={entry.fiscalYear.name} />
          <Field label="Accounting Period" value={entry.accountingPeriod.name} />
          <Field label="Reference" value={entry.reference} />
          <Field
            label="Source Type"
            value={JOURNAL_ENTRY_SOURCE_TYPE_LABELS[entry.sourceType as JournalEntrySourceType]}
          />
          <Field label="Description" value={entry.description} />
          <Field label="Label" value={entry.label} />
          <Field label="Created By" value={entry.createdBy?.name} />
          <Field label="Created Date" value={formatDate(entry.createdAt)} />
          {entry.status === "POSTED" ? <Field label="Posted At" value={entry.postedAt ? formatDate(entry.postedAt) : "—"} /> : null}
          {entry.status === "POSTED" ? <Field label="Posted By" value={entry.postedByUser?.name} /> : null}
          <Field label="Updated Date" value={formatDate(entry.updatedAt)} />
        </CardContent>
      </Card>

      {readyCheck && !readyCheck.valid ? (
        <div className="rounded-lg border border-negative/20 bg-negative/5 px-4 py-3 text-sm text-ink-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
            <div>
              <p className="font-semibold">This journal entry requires review before posting.</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-700">
                {readyCheck.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {entry.status === "IN_REVIEW" || entry.status === "NEEDS_REVIEW" || entry.status === "NOT_BALANCED" || entry.status === "BALANCED" ? (
        <div className="rounded-lg border border-pending/20 bg-pending/5 px-4 py-3 text-sm text-ink-800">
          <strong>Human Review</strong> — this journal entry was prepared for human review. The server validation result is authoritative; approval does not post the entry.
        </div>
      ) : entry.status === "APPROVED" ? (
        <div className="rounded-lg border border-positive/20 bg-positive/5 px-4 py-3 text-sm text-ink-800">
          <strong>Approved</strong> — human approval is recorded. The entry is still unposted; pre-posting checks are required before it can become Ready to Post.
        </div>
      ) : entry.status === "READY_TO_POST" || entry.status === "READY_FOR_POSTING" ? (
          <div className="rounded-lg border border-positive/20 bg-positive/5 px-4 py-3 text-sm text-ink-800"><strong>Ready to Post</strong> — pre-posting checks have passed. No General Ledger, Trial Balance, or financial statement data has been changed.</div>
        ) : entry.status === "REJECTED" ? (
          <div className="rounded-lg border border-negative/20 bg-negative/5 px-4 py-3 text-sm text-ink-800"><strong>Rejected</strong> — this journal requires correction or a new review decision.</div>
        ) : entry.status === "POSTED" ? (
        <div className="rounded-lg border border-ink-200 bg-surface-muted px-4 py-3 text-sm text-ink-700">
          Posted journal entries are locked.
        </div>
      ) : entry.status === "VOID" ? (
        <div className="rounded-lg border border-ink-200 bg-surface-muted px-4 py-3 text-sm text-ink-700">
          Void journal entries cannot be modified.
        </div>
      ) : null}

      <JournalEntryValidationSummary
        valid={reviewValidation.valid}
        errors={reviewErrors}
        totalDebit={reviewValidation.totalDebit.toFixed(4)}
        totalCredit={reviewValidation.totalCredit.toFixed(4)}
        difference={reviewValidation.difference.toFixed(4)}
        balanced={reviewValidation.balanced}
        status={entry.status}
        findings={draftValidation?.findings ?? []}
      />

      {entry.transactionCandidate || entry.sourceDocument || entry.aiSuggestion ? (
        <Card>
          <CardHeader>
            <CardTitle>Source Traceability</CardTitle>
            <CardDescription>
              This Draft Journal Entry retains its source transaction and source document. AI-originated values remain
              identifiable after user edits.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {entry.sourceDocument ? (
              <Field
                label="Source Document"
                value={
                  <Link
                    href={`/companies/${company.id}/documents/${entry.sourceDocument.id}`}
                    className="text-ink-900 underline"
                  >
                    {entry.sourceDocument.originalFileName}
                  </Link>
                }
              />
            ) : null}
            {entry.transactionCandidate ? (
              <Field
                label="Transaction Candidate"
                value={
                  entry.transactionCandidate.sourceSheetName
                    ? `Sheet: ${entry.transactionCandidate.sourceSheetName} · Row: ${entry.transactionCandidate.sourceRowNumber ?? entry.transactionCandidate.sourceRowReference}`
                    : entry.transactionCandidate.sourceRowReference
                }
              />
            ) : null}
            {entry.aiSuggestion ? (
              <>
                <Field label="AI Provider" value={`${entry.aiSuggestion.provider}${entry.aiSuggestion.model ? ` (${entry.aiSuggestion.model})` : ""}`} />
                <Field label="AI Confidence" value={entry.aiSuggestion.confidence} />
                <Field label="AI-generated / User-corrected" value={entry.lines.some((line) => line.accountSource === "USER" || line.debitSource === "USER" || line.creditSource === "USER") ? "User-corrected fields present" : "AI-generated fields retained"} />
                <Field label="AI Explanation" value={entry.aiSuggestion.explanation} />
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Approval History</CardTitle>
          <CardDescription>Human review and approval events from the existing audit system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Created By" value={entry.createdBy?.name} />
            <Field label="Reviewed By" value={entry.reviewedByUser?.name} />
            <Field label="Approved By" value={entry.approvedByUser?.name} />
            <Field label="Reviewed At" value={entry.reviewedAt ? formatDate(entry.reviewedAt) : "—"} />
            <Field label="Approved At" value={entry.approvedAt ? formatDate(entry.approvedAt) : "—"} />
            <Field label="Rejected By" value={entry.rejectedByUser?.name} />
          </div>
          {entry.rejectionReason ? <div className="rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-800"><strong>Rejection reason:</strong> {entry.rejectionReason}</div> : null}
          <div className="divide-y divide-ink-100 rounded-md border border-ink-100">
            {approvalHistory.filter((event) => event.action.startsWith("JOURNAL_")).map((event) => (
              <div key={event.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium text-ink-900">{event.action.replaceAll("_", " ")}</p><p className="text-ink-600">{event.user.name}</p></div>
                <p className="text-xs text-ink-500">{formatDate(event.createdAt)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {entry.aiReviewAudits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Review Audit Trail</CardTitle>
            <CardDescription>Review and status changes recorded in the existing audit system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {entry.aiReviewAudits.map((audit) => (
              <div key={audit.id} className="flex flex-col gap-1 rounded-md border border-ink-100 bg-surface-subtle px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ink-900">{audit.action.replaceAll("_", " ")}</p>
                  <p className="text-ink-600">{audit.relevantCorrection || "Review status changed."}</p>
                  {audit.user ? <p className="text-xs text-ink-500">By {audit.user.name}</p> : null}
                </div>
                <p className="text-xs text-ink-500">{formatDate(audit.createdAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Journal Lines</CardTitle>
          <CardDescription>
            {entry.status === "DRAFT"
              ? "Edit the draft for field changes; use Move Up or Move Down to persist line order without recreating lines."
              : "Journal line amounts and current balance validation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entry.lines.length === 0 ? (
            <EmptyState icon={ListChecks} title="No journal lines added." />
          ) : (
            <JournalEntryLinesManager
              companyId={company.id}
              journalEntryId={entry.id}
              status={entry.status}
              lines={entry.lines.map((line) => ({
                id: line.id,
                description: line.description,
                reference: line.reference,
                debit: line.debit.toString(),
                credit: line.credit.toString(),
                account: { code: line.account.code, name: line.account.name },
                taxCode: line.taxCode ? { code: line.taxCode.code, name: line.taxCode.name } : null,
                accountSource: line.accountSource,
                debitSource: line.debitSource,
                creditSource: line.creditSource,
              }))}
            />
          )}

          <div className="mt-4">
            <JournalEntryBalanceSummary
              totalDebit={balance.totalDebit.toFixed(4)}
              totalCredit={balance.totalCredit.toFixed(4)}
              difference={balance.difference.toFixed(4)}
              balanced={balanced}
              validationMessage={balanceMessage}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
