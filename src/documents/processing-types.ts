import type { DocumentExtractionStatus, DocumentFileType } from "@prisma/client";

export type ExtractedCell = {
  address: string;
  rowIndex: number;
  columnIndex: number;
  value: string | number | boolean | null;
  formula?: string;
  type?: string;
};

export type ExtractedTable = {
  id: string;
  headers: string[];
  rows: string[][];
  source: { pageNumber?: number; sheetName?: string; rowStart?: number; rowEnd?: number };
};

export type NormalizedDocumentContent = {
  version: "5A3";
  documentId: string;
  documentType?: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    textBlocks: Array<{ text: string; lineOrder: number }>;
    tables: ExtractedTable[];
    dateCandidates: string[];
    amountCandidates: string[];
  }>;
  sheets: Array<{
    name: string;
    rows: Array<{ rowNumber: number; cells: ExtractedCell[] }>;
    columns: string[];
    tables: ExtractedTable[];
  }>;
  tables: ExtractedTable[];
  rows: Array<{ source: string; rowNumber: number; cells: string[] }>;
  columns: Array<{ source: string; index: number; name: string }>;
  textBlocks: Array<{ source: string; text: string; lineOrder?: number }>;
  metadata: Record<string, unknown>;
  warnings: string[];
};

export type DocumentProcessingResult = {
  documentId: string;
  status: DocumentExtractionStatus;
  fileType: DocumentFileType;
  metadata: {
    pageCount?: number;
    sheetCount?: number;
    tableCount?: number;
    rowCount?: number;
    columnCount?: number;
    textBlockCount?: number;
    requiresOcr: boolean;
  };
  extractedContentReference?: string;
  warnings: string[];
  error?: string;
  processedAt?: Date;
};
