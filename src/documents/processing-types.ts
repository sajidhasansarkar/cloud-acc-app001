import type { DocumentFileType } from "@/documents/config";

export type ProcessingContent =
  | { kind: "pdf"; pageCount: number; pages: Array<{ pageNumber: number; text: string }> }
  | { kind: "csv"; columns: string[]; rows: string[][]; rowCount: number; columnCount: number }
  | { kind: "excel"; workbook: string; sheets: Array<{ name: string; columns: string[]; rows: unknown[][]; rowCount: number; columnCount: number }> }
  | { kind: "image"; requiresOcr: true };

export type DocumentProcessingResult = {
  documentId: string;
  status: "PROCESSED" | "FAILED";
  fileType: DocumentFileType;
  metadata: {
    pageCount?: number;
    sheetCount?: number;
    rowCount?: number;
    columnCount?: number;
    requiresOcr: boolean;
  };
  extractedContentReference?: string;
  error?: string;
  processedAt?: Date;
};
