import type { DocumentProcessingRoute } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";

export type RoutedDocument = {
  documentId: string;
  documentType: string;
  processingRoute: DocumentProcessingRoute;
  processorImplemented: false;
};

/**
 * Routes an already-classified document to the future processor boundary.
 * Phase 5A-2 deliberately does not invoke any processor or parse content.
 */
export async function routeDocument(documentId: string): Promise<RoutedDocument | null> {
  const { organization } = await requireActiveOrganization();
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: organization.id, company: { organizationId: organization.id } },
    select: { id: true, companyId: true, classification: { select: { documentType: true, processingRoute: true, status: true } } },
  });
  if (!document) return null;
  const company = await getOwnedCompany(organization.id, document.companyId);
  if (!company || !document.classification) return null;
  return {
    documentId: document.id,
    documentType: document.classification.documentType,
    processingRoute: document.classification.processingRoute,
    processorImplemented: false,
  };
}
