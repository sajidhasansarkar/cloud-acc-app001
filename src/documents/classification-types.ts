import type { AccountingDocumentType, ClassificationConfidence, DocumentClassificationStatus, DocumentProcessingRoute } from "@prisma/client";

export type ClassificationResult = {
  documentType: AccountingDocumentType;
  confidence: ClassificationConfidence;
  reasoning: string;
  processingRoute: DocumentProcessingRoute;
  method: "METADATA_RULES" | "MANUAL";
};

export type ClassificationState = {
  status: DocumentClassificationStatus;
  documentType: AccountingDocumentType;
  confidence: ClassificationConfidence;
  reasoning: string | null;
  processingRoute: DocumentProcessingRoute;
  classifierMethod: string | null;
  manuallyReviewed: boolean;
  classifiedAt: Date | null;
};
