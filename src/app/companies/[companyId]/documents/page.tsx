import { FileArchive } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canManageDocuments } from "@/lib/rbac";
import { listDocuments } from "@/accounting/documents";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentsTable } from "@/components/documents/documents-table";
import { DocumentsPagination } from "@/components/documents/documents-pagination";
import { DocumentsError } from "@/components/documents/documents-error";
import { DOCUMENT_STORAGE_PROVIDER } from "@/documents/config";

export const metadata = { title: "Documents — Ledger" };
export default async function CompanyDocumentsPage({ params, searchParams }: { params: { companyId: string }; searchParams?: { page?: string } }) {
  const { role, organization } = await requireActiveOrganization();
  const company = await requireOwnedCompany(params.companyId);
  const canManage = canManageDocuments(role);
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  let result;
  try { result = await listDocuments(organization.id, company.id, page); }
  catch { return <div className="space-y-6"><div><h1 className="font-display text-xl font-semibold text-ink-900">Document Upload Center</h1><p className="text-sm text-ink-500">Accounting documents for {company.displayName}.</p></div><DocumentsError /></div>; }
  return <div className="space-y-6"><div><h1 className="font-display text-xl font-semibold text-ink-900">Document Upload Center</h1><p className="text-sm text-ink-500">Securely register accounting documents for {company.displayName}. Document type will be detected automatically.</p></div>{canManage ? <DocumentUpload companyId={company.id} storageProvider={DOCUMENT_STORAGE_PROVIDER} /> : <div className="rounded-lg border border-ink-100 bg-white p-4 text-sm text-ink-500 shadow-card">You have read-only access to documents.</div>}<div><div className="mb-3"><h2 className="font-display text-sm font-semibold text-ink-900">Accounting documents</h2><p className="mt-1 text-xs text-ink-500">Bank statements, invoices, bills, receipts, balance sheets, income statements, trial balances, general ledgers, tax documents, payroll documents, expense reports, and other accounting documents.</p></div>{result.documents.length === 0 ? <EmptyState icon={FileArchive} title="No documents yet." description={canManage ? "Upload a document to get started." : "No documents have been uploaded for this company."} /> : <><DocumentsTable companyId={company.id} documents={result.documents} /><div className="mt-3"><DocumentsPagination companyId={company.id} page={result.page} pageCount={result.pageCount} /></div></>}</div></div>;
}
