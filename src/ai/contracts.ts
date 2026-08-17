import type { NormalizationConfidence } from "@prisma/client";

export type FutureAISuggestion = {
  suggestedAccount?: { code: string; name: string };
  suggestedAccountCode?: string;
  suggestedDebit?: string;
  suggestedCredit?: string;
  explanation?: string;
  confidence?: NormalizationConfidence;
  warnings: string[];
};
