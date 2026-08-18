import { NextResponse } from "next/server";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedDocument } from "@/accounting/documents";
import { getOwnedCompany } from "@/accounting/access";
import { getDocumentStorage } from "@/storage/document-storage";

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string; documentId: string } }
) {
  try {
    const { organization } = await requireActiveOrganization();
    const company = await getOwnedCompany(organization.id, params.companyId);
    if (!company) return new NextResponse("Not found", { status: 404 });

    const document = await getOwnedDocument(organization.id, company.id, params.documentId);
    if (!document) return new NextResponse("Not found", { status: 404 });

    const buffer = await getDocumentStorage().read(document.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `inline; filename="${document.originalFileName.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Unable to access document.", { status: 404 });
  }
}
