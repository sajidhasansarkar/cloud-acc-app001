"use server";
import { revalidatePath } from "next/cache";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageDocuments } from "@/lib/rbac";
import { deleteDocument } from "@/accounting/documents";
export async function deleteDocumentAction(companyId:string,documentId:string){ const {role,organization}=await requireActiveOrganization(); if(!canManageDocuments(role))return{ok:false as const,error:"You don't have permission to manage documents."}; const company=await getOwnedCompany(organization.id,companyId); if(!company)return{ok:false as const,error:"Company not found."}; const result=await deleteDocument(organization.id,company.id,documentId); if(result.ok)revalidatePath(`/companies/${company.id}/documents`); return result; }
