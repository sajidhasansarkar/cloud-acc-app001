import { NextResponse } from "next/server";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { canManageDocuments } from "@/lib/rbac";
import { createDocument } from "@/accounting/documents";
import { processDocument } from "@/documents/processing";
export const runtime = "nodejs";
export async function POST(request:Request,{params}:{params:{companyId:string}}){
  try{
    const {user,role,organization}=await requireActiveOrganization();
    if(!canManageDocuments(role))return NextResponse.json({ok:false,error:"You don't have permission to manage documents."},{status:403});
    const company=await getOwnedCompany(organization.id,params.companyId); if(!company)return NextResponse.json({ok:false,error:"Company not found."},{status:404});
    const form=await request.formData(); const value=form.get("file"); if(!(value instanceof File))return NextResponse.json({ok:false,error:"File is required."},{status:400});
    const result=await createDocument(organization.id,company.id,user.id,value); if(!result.ok)return NextResponse.json(result,{status:400});
    const processing=await processDocument(organization.id,company.id,result.document.id);
    return NextResponse.json({ok:true,processingStatus:processing.status,document:{id:result.document.id,originalFileName:result.document.originalFileName,fileType:result.document.fileType,mimeType:result.document.mimeType,fileSize:result.document.fileSize.toString(),documentStatus:processing.status,uploadedBy:result.document.uploadedBy.name,createdAt:result.document.createdAt.toISOString(),processingError:processing.error??null}});
  }catch(error){console.error("Document upload route failed",error);return NextResponse.json({ok:false,error:"Upload failed. Please try again."},{status:500});}
}
