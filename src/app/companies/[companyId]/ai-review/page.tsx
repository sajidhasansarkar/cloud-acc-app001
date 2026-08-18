import Link from "next/link";
import { ClipboardCheck, ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { listAIReviewQueue } from "@/ai/reconciliation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewCompanySwitcher } from "@/components/ai-review/review-company-switcher";
import type { HumanReviewStatus, NormalizationConfidence } from "@prisma/client";

export const metadata = { title: "AI Review Queue — Ledger" };

function statusVariant(value: string) {
  if (value === "READY_FOR_POSTING" || value === "HIGH") return "success" as const;
  if (value === "PENDING_REVIEW" || value === "MEDIUM") return "warning" as const;
  if (value === "NEEDS_CORRECTION" || value === "REJECTED" || value === "LOW") return "danger" as const;
  return "default" as const;
}

export default async function AIReviewQueuePage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams?: {
    status?: string;
    documentId?: string;
    confidence?: string;
    warningState?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, params.companyId);
  if (!company) {
    return <EmptyState icon={ClipboardCheck} title="Review queue unavailable." />;
  }

  const status = ["PENDING_REVIEW", "NEEDS_CORRECTION", "READY_FOR_POSTING", "REJECTED"].includes(searchParams?.status ?? "")
    ? searchParams?.status as HumanReviewStatus
    : undefined;
  const confidence = ["HIGH", "MEDIUM", "LOW"].includes(searchParams?.confidence ?? "")
    ? searchParams?.confidence as NormalizationConfidence
    : undefined;
  const warningState = ["ANY", "WARNINGS", "NO_WARNINGS"].includes(searchParams?.warningState ?? "")
    ? searchParams?.warningState as "ANY" | "WARNINGS" | "NO_WARNINGS"
    : "ANY";

  const [rows, documents, companies] = await Promise.all([
    listAIReviewQueue(organization.id, company.id, {
      status,
      documentId: searchParams?.documentId || undefined,
      confidence,
      warningState,
      dateFrom: searchParams?.dateFrom ? new Date(`${searchParams.dateFrom}T00:00:00.000Z`) : undefined,
      dateTo: searchParams?.dateTo ? new Date(`${searchParams.dateTo}T23:59:59.999Z`) : undefined,
    }),
    prisma.document.findMany({
      where: { companyId: company.id, organizationId: organization.id },
      select: { id: true, originalFileName: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.company.findMany({
      where: { organizationId: organization.id },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const query = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    const current = {
      status: searchParams?.status ?? "",
      documentId: searchParams?.documentId ?? "",
      confidence: searchParams?.confidence ?? "",
      warningState: searchParams?.warningState ?? "",
      ...overrides,
    };
    Object.entries(current).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const qs = params.toString();
    return `/companies/${company.id}/ai-review${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/companies/${company.id}`} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to company
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold text-ink-900">AI Review Queue</h1>
        <p className="text-sm text-ink-500">Human reconciliation queue for {company.displayName}.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ReviewCompanySwitcher companies={companies} currentCompanyId={company.id} />
            <select name="status" defaultValue={searchParams?.status ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
              <option value="">All statuses</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="NEEDS_CORRECTION">Needs Correction</option>
              <option value="READY_FOR_POSTING">Ready for Posting</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select name="documentId" defaultValue={searchParams?.documentId ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
              <option value="">All documents</option>
              {documents.map((document) => <option key={document.id} value={document.id}>{document.originalFileName}</option>)}
            </select>
            <select name="confidence" defaultValue={searchParams?.confidence ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
              <option value="">All confidence</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select name="warningState" defaultValue={searchParams?.warningState ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
              <option value="">Any warning state</option>
              <option value="WARNINGS">Warnings</option>
              <option value="NO_WARNINGS">No warnings</option>
            </select>
            <input name="dateFrom" type="date" defaultValue={searchParams?.dateFrom ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm" />
            <input name="dateTo" type="date" defaultValue={searchParams?.dateTo ?? ""} className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm" />
            <div className="md:col-span-4 flex gap-2">
              <button className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply Filters</button>
              <Link href={`/companies/${company.id}/ai-review`} className="rounded-md border border-ink-200 px-4 py-2 text-sm">Clear</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {!rows?.length ? (
            <div className="p-6"><EmptyState icon={ClipboardCheck} title="No reviews found." description="No transaction candidates match the current queue filters." /></div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="border-b border-ink-100 bg-surface-muted">
                <tr>
                  <th className="px-3 py-3 text-left">Source</th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Amount</th>
                  <th className="px-3 py-3 text-left">Confidence</th>
                  <th className="px-3 py-3 text-left">Warnings</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => {
                  const candidate = row.candidate;
                  const suggestion = candidate.aiReviewSuggestions[0];
                  const sourceWarnings = Array.isArray(candidate.warnings) ? candidate.warnings.map(String) : [];
                  const aiWarnings = suggestion && Array.isArray(suggestion.warnings) ? suggestion.warnings.map(String) : [];
                  const warnings = [...sourceWarnings, ...aiWarnings];
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink-900">{candidate.document.originalFileName}</p>
                        <p className="text-ink-500">{candidate.sourceSheetName ? `Sheet ${candidate.sourceSheetName}` : candidate.sourcePageNumber ? `Page ${candidate.sourcePageNumber}` : candidate.sourceRowReference}</p>
                      </td>
                      <td className="px-3 py-3">{candidate.date ? new Date(candidate.date).toISOString().slice(0, 10) : "—"}</td>
                      <td className="px-3 py-3">{candidate.amount?.toString() ?? candidate.debit?.toString() ?? candidate.credit?.toString() ?? "—"} {candidate.currency ?? ""}</td>
                      <td className="px-3 py-3"><Badge variant={statusVariant(suggestion?.confidence ?? "—")}>{suggestion?.confidence ?? "—"}</Badge></td>
                      <td className="px-3 py-3">{warnings.length ? `${warnings.length} warning(s)` : "None"}</td>
                      <td className="px-3 py-3"><Badge variant={statusVariant(row.humanReviewStatus)}>{row.humanReviewStatus.replaceAll("_", " ")}</Badge></td>
                      <td className="px-3 py-3">
                        <Link href={`/companies/${company.id}/ai-review/${candidate.id}`} className="font-medium text-ink-900 underline">Review</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
