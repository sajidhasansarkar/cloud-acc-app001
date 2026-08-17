export type NormalizationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type NormalizedCandidateDraft = {
  sourceRowReference: string;
  sourceSheetName?: string;
  sourcePageNumber?: number;
  sourceRowNumber?: number;
  date?: Date;
  dateConfidence: NormalizationConfidence;
  description?: string;
  descriptionConfidence: NormalizationConfidence;
  reference?: string;
  referenceConfidence: NormalizationConfidence;
  debit?: string;
  credit?: string;
  amount?: string;
  balance?: string;
  currency?: string;
  currencyConfidence: NormalizationConfidence;
  transactionType?: string;
  confidence: NormalizationConfidence;
  warnings: string[];
  possibleDuplicate: boolean;
};

export type NormalizationResult = {
  documentId: string;
  candidateCount: number;
  ignoredRowCount: number;
  duplicateCount: number;
  warningsCount: number;
};
