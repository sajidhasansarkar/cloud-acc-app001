import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { prisma } from "@/lib/prisma";
import { getSourceAIDraftReconciliation } from "@/ai/reconciliation";
import { ReviewReconciliation } from "@/components/ai-review/review-reconciliation";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "AI Review Reconciliation — Ledger" };

export default async function AIReviewReconciliationPage({
  params,
}: {
  params: { companyId: string; candidateId: string };
}) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, params.companyId);

  if (!company) {
    return <EmptyState icon={ClipboardCheck} title="Review not found." description="This review is unavailable for the selected company." />;
  }

  const candidate = await prisma.normalizedTransactionCandidate.findFirst({
    where: {
      id: params.candidateId,
      companyId: company.id,
      organizationId: organization.id,
    },
    select: { documentId: true },
  });

  const data = candidate
    ? await getSourceAIDraftReconciliation(
        organization.id,
        company.id,
        candidate.documentId,
        params.candidateId
      )
    : null;

  if (!data) {
    return <EmptyState icon={ClipboardCheck} title="Review not found." description="The transaction candidate is unavailable for this company." />;
  }

  const serialized = JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/companies/${company.id}/ai-review`}
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to AI Review Queue
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold text-ink-900">Source vs AI vs Draft Reconciliation</h1>
        <p className="text-sm text-ink-500">{company.displayName}</p>
      </div>
      <ReviewReconciliation data={serialized} />
    </div>
  );
}
