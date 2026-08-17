import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { getOwnedDocumentDetails } from "@/accounting/documents";
import { DocumentDetails } from "@/components/documents/document-details";
import { DocumentRetryAction } from "@/components/documents/document-retry-action";
import { DocumentNormalizeAction } from "@/components/documents/document-normalize-action";
import { NormalizedCandidates } from "@/components/documents/normalized-candidates";
import { ExtractedDataPreview } from "@/components/documents/extracted-data-preview";
import { listOwnedCandidates, getExtractedPreview } from "@/documents/normalization";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSearch } from "lucide-react";

export const metadata = { title: "Document Details — Ledger" };

export default async function CompanyDocumentDetailsPage({ params }: { params: { companyId: string; documentId: string } }) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, params.companyId);
  if (!company) return <EmptyState icon={FileSearch} title="Document not found." description="The document is unavailable for this company." />;
  const document = await getOwnedDocumentDetails(organization.id, company.id, params.documentId);
  if (!document) return <EmptyState icon={FileSearch} title="Document not found." description="The document is unavailable for this company." />;
  const candidates = await listOwnedCandidates(organization.id, company.id, document.id);
  const preview = await getExtractedPreview(organization.id, company.id, document.id);

  return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Link href={`/companies/${company.id}/documents`} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800"><ArrowLeft className="h-3.5 w-3.5" />Back to Documents</Link><h1 className="mt-2 font-display text-xl font-semibold text-ink-900">Document Details</h1><p className="text-sm text-ink-500">Processing and normalization review for {company.displayName}.</p></div><div className="flex items-center gap-2">{document.documentStatus === "PROCESSED" ? <DocumentNormalizeAction companyId={company.id} documentId={document.id} /> : null}{document.documentStatus === "FAILED" ? <DocumentRetryAction companyId={company.id} documentId={document.id} /> : null}</div></div><DocumentDetails document={document} result={document.processingResult} /><ExtractedDataPreview preview={preview} /><NormalizedCandidates companyId={company.id} documentId={document.id} candidates={candidates} /><div className="rounded-lg border border-ink-100 bg-white p-4 text-xs text-ink-500 shadow-card">Original files remain in storage. Normalization only prepares reviewable transaction candidates; it does not select accounts, create Journal Entries, post accounting entries, or modify the extracted source.</div><Link href={`/companies/${company.id}/documents`}><Button variant="ghost">Back to documents</Button></Link></div>;
}
