import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireActiveOrganization } from "@/lib/session";
import { canManageDocuments } from "@/lib/rbac";
import { getOwnedCompany } from "@/accounting/access";
import {
  DOCUMENT_FILE_TYPES,
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE,
  getDocumentFileType,
} from "@/documents/config";

export const runtime = "nodejs";

type ClientPayload = {
  companyId: string;
  originalFileName: string;
  mimeType: string;
};

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
): Promise<NextResponse> {
  try {
    const { role, organization } = await requireActiveOrganization();
    if (!canManageDocuments(role)) {
      return NextResponse.json({ error: "You don't have permission to manage documents." }, { status: 403 });
    }

    const company = await getOwnedCompany(organization.id, params.companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!clientPayload) throw new Error("Upload metadata is required.");

        let payload: ClientPayload;
        try {
          payload = JSON.parse(clientPayload) as ClientPayload;
        } catch {
          throw new Error("Invalid upload metadata.");
        }

        if (payload.companyId !== company.id || !payload.originalFileName?.trim() || !payload.mimeType) {
          throw new Error("Invalid upload metadata.");
        }

        const fileType = getDocumentFileType(payload.originalFileName);
        if (!fileType || !DOCUMENT_FILE_TYPES.includes(fileType)) {
          throw new Error("Unsupported file type.");
        }

        const mimeType = payload.mimeType.toLowerCase();
        if (!DOCUMENT_MIME_TYPES[fileType].includes(mimeType)) {
          throw new Error("Unsupported file type.");
        }

        const expectedPrefix = `documents/${company.id}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid storage path.");
        }

        const pathnameFileType = getDocumentFileType(pathname);
        if (pathnameFileType !== fileType) {
          throw new Error("Upload path does not match the file type.");
        }

        return {
          addRandomSuffix: false,
          allowedContentTypes: [...DOCUMENT_MIME_TYPES[fileType]],
          maximumSizeInBytes: MAX_DOCUMENT_SIZE,
          tokenPayload: JSON.stringify({
            companyId: company.id,
            originalFileName: payload.originalFileName.trim(),
            mimeType,
            fileType,
            storageKey: pathname,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Finalization is performed by the authenticated browser request after
        // upload() resolves, so local development does not depend on a Vercel
        // webhook being able to reach localhost.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed." },
      { status: 400 }
    );
  }
}
