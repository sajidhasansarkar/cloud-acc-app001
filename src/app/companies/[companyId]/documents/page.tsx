import { FileArchive } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { requireOwnedCompany } from "@/lib/company-guard";
import { canManageDocuments } from "@/lib/rbac";
import { listDocuments } from "@/accounting/documents";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentsTable } from "@/components/documents/documents-table";
import { DocumentsError } from "@/components/documents/documents-error";
import { DOCUMENT_STORAGE_PROVIDER } from "@/documents/config";
export const metadata={title:"Documents — Ledger"};
export default async function CompanyDocumentsPage({params}:{params:{companyId:string}}){const{role,organization}=await requireActiveOrganization();const company=await requireOwnedCompany(params.companyId);const canManage=canManageDocuments(role);let documents;try{documents=await listDocuments(organization.id,company.id);}catch{return <div className="space-y-6"><div><h1 className="font-display text-xl font-semibold text-ink-900">Documents</h1><p className="text-sm text-ink-500">Accounting documents for {company.displayName}.</p></div><DocumentsError/></div>;}return <div className="space-y-6"><div><h1 className="font-display text-xl font-semibold text-ink-900">Documents</h1><p className="text-sm text-ink-500">Store accounting-related documents for {company.displayName}. Uploaded files are processed into structured metadata for future extraction workflows.</p></div>{canManage?<DocumentUpload companyId={company.id} storageProvider={DOCUMENT_STORAGE_PROVIDER}/>:<div className="rounded-lg border border-ink-100 bg-white p-4 text-sm text-ink-500 shadow-card">You have read-only access to documents.</div>}{documents.length===0?<EmptyState icon={FileArchive} title="No documents yet." description={canManage?"Upload a PDF, spreadsheet, CSV, or image to get started.":"No documents have been uploaded for this company."}/>:<DocumentsTable companyId={company.id} documents={documents}/>}</div>}
