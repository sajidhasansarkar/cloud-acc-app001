import Link from "next/link";
import { ArrowLeft, FileSearch } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { getOwnedDocumentDetails } from "@/accounting/documents";
import { DocumentDetails } from "@/components/documents/document-details";
import { EmptyState } from "@/components/ui/empty-state";
import { canManageDocuments, canReviewAI } from "@/lib/rbac";
import { getExtractionPreview } from "@/documents/processing";

export const metadata = { title: "Document Details — Ledger" };
export default async function CompanyDocumentDetailsPage({ params }: { params: { companyId: string; documentId: string } }) {
  const { organization, role } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, params.companyId);
  if (!company) return <EmptyState icon={FileSearch} title="Document not found." description="The document is unavailable for this company." />;
  const document = await getOwnedDocumentDetails(organization.id, company.id, params.documentId);
  if (!document) return <EmptyState icon={FileSearch} title="Document not found." description="The document is unavailable for this company." />;
  const preview = await getExtractionPreview(organization.id, company.id, params.documentId).catch(() => null);
  return <div className="space-y-5"><div><Link href={`/companies/${company.id}/documents`} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800"><ArrowLeft className="h-3.5 w-3.5" />Back to Documents</Link><h1 className="mt-2 font-display text-xl font-semibold text-ink-900">Document Details</h1><p className="text-sm text-ink-500">Review the uploaded document metadata and activity.</p></div><DocumentDetails companyId={company.id} document={document} auditEvents={document.auditEvents} canManage={canManageDocuments(role)} canReviewMapping={canManageDocuments(role) || canReviewAI(role)} preview={preview} /></div>;
}
