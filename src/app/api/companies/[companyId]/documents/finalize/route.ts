import { NextResponse } from "next/server";
import { requireActiveOrganization } from "@/lib/session";
import { canManageDocuments } from "@/lib/rbac";
import { finalizeUploadedDocument } from "@/accounting/documents";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const { role, organization, user } = await requireActiveOrganization();
    if (!canManageDocuments(role)) {
      return NextResponse.json({ ok: false, error: "You don't have permission to manage documents." }, { status: 403 });
    }

    const body = (await request.json()) as {
      storageKey?: string;
      originalFileName?: string;
      mimeType?: string;
    };

    if (!body.storageKey || !body.originalFileName || !body.mimeType) {
      return NextResponse.json({ ok: false, error: "Upload metadata is required." }, { status: 400 });
    }

    const result = await finalizeUploadedDocument(
      organization.id,
      params.companyId,
      user.id,
      body.storageKey,
      body.originalFileName,
      body.mimeType
    );

    if (!result.ok) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({
      ok: true,
      document: {
        id: result.document.id,
        originalFileName: result.document.originalFileName,
        fileType: result.document.fileType,
        mimeType: result.document.mimeType,
        fileSize: result.document.fileSize.toString(),
        documentStatus: result.document.documentStatus,
        uploadedBy: result.document.uploadedBy.name,
        createdAt: result.document.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Document finalization failed", error);
    return NextResponse.json({ ok: false, error: "Upload finalization failed. Please try again." }, { status: 500 });
  }
}
