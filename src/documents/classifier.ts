import type { AccountingDocumentType, ClassificationConfidence, DocumentFileType } from "@prisma/client";
import { processingRouteFor } from "@/documents/classification-config";
import type { ClassificationResult } from "@/documents/classification-types";

/**
 * Provider-neutral classification contract. Phase 5A-2 intentionally uses
 * metadata rules only. Future AI providers can implement this contract
 * without changing callers.
 */
export interface DocumentClassifier {
  classify(input: { originalFileName: string; fileType: DocumentFileType; mimeType: string }): Promise<ClassificationResult>;
}

type Rule = { type: AccountingDocumentType; exact: RegExp[]; partial: RegExp[]; label: string };

const RULES: Rule[] = [
  { type: "BANK_STATEMENT", exact: [/\bbank[ _-]+statement\b/i, /\bstatement[ _-]+of[ _-]+account\b/i, /\bche(?:qu|ck)ing[ _-]+(?:acc(?:ount)?|statement)\b/i, /\bsavings[ _-]+(?:acc(?:ount)?|statement)\b/i], partial: [/\bbank\b/i, /\btransaction[ _-]+history\b/i, /\bche(?:qu|ck)ing\b/i, /\bsavings\b/i, /\biban\b/i, /\bswift\b/i], label: "bank statement" },
  { type: "BALANCE_SHEET", exact: [/\bbalance[ _-]+sheet\b/i, /\bstatement[ _-]+of[ _-]+financial[ _-]+position\b/i], partial: [/\bbalance\b/i], label: "balance sheet" },
  { type: "INCOME_STATEMENT", exact: [/\bincome[ _-]+statement\b/i, /\bprofit[ _-]+and[ _-]+loss\b/i, /\bp[ _&-]+l\b/i], partial: [/\bincome\b/i, /\bprofit\b/i], label: "income statement" },
  { type: "TRIAL_BALANCE", exact: [/\btrial[ _-]+balance\b/i], partial: [/\btrial\b/i], label: "trial balance" },
  { type: "GENERAL_LEDGER", exact: [/\bgeneral[ _-]+ledger\b/i, /\bgl[ _-]+report\b/i], partial: [/\bledger\b/i], label: "general ledger" },
  { type: "EXPENSE_REPORT", exact: [/\bexpense[ _-]+report\b/i, /\bexpenses[ _-]+report\b/i], partial: [/\bexpense\b/i], label: "expense report" },
  { type: "PAYROLL_DOCUMENT", exact: [/\bpayroll\b/i, /\bpay[ _-]+run\b/i, /\bsalary[ _-]+report\b/i], partial: [/\bsalary\b/i, /\bwages\b/i], label: "payroll document" },
  { type: "TAX_DOCUMENT", exact: [/\btax[ _-]+return\b/i, /\btax[ _-]+document\b/i, /\bgst\b/i, /\bhst\b/i, /\bvat\b/i, /\bt4\b/i], partial: [/\btax\b/i], label: "tax document" },
  { type: "RECEIPT", exact: [/\breceipt\b/i, /\bpos[ _-]+receipt\b/i], partial: [/\breceipt\b/i], label: "receipt" },
  { type: "INVOICE", exact: [/\binvoice\b/i, /\binv[._ -]?\d+/i], partial: [/\binv\b/i], label: "invoice" },
  { type: "BILL", exact: [/\bbill\b/i, /\bvendor[ _-]+bill\b/i, /\bsupplier[ _-]+bill\b/i], partial: [/\bbill\b/i], label: "bill" },
  { type: "OTHER", exact: [/\bother\b/i], partial: [], label: "other document" },
];

function confidenceFor(exactMatches: number, partialMatches: number): ClassificationConfidence {
  if (exactMatches >= 2) return "HIGH";
  if (exactMatches >= 1) return "MEDIUM";
  if (partialMatches >= 1) return "LOW";
  return "LOW";
}

export const metadataDocumentClassifier: DocumentClassifier = {
  async classify(input) {
    const filename = input.originalFileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    const ranked = RULES.map((rule) => ({
      rule,
      exactMatches: rule.exact.filter((pattern) => pattern.test(filename)).length,
      partialMatches: rule.partial.filter((pattern) => pattern.test(filename)).length,
    }))
      .filter((item) => item.exactMatches > 0 || item.partialMatches > 0)
      .sort((a, b) => (b.exactMatches - a.exactMatches) || (b.partialMatches - a.partialMatches));

    const winner = ranked[0];
    const second = ranked[1];
    const ambiguous = Boolean(winner && second && winner.exactMatches > 0 && second.exactMatches === winner.exactMatches);
    if (!winner || ambiguous) {
      return {
        documentType: "UNKNOWN",
        confidence: "LOW",
        reasoning: ambiguous
          ? "Available metadata matches multiple accounting-document categories equally. Content analysis is not implemented in this phase, so manual review is required."
          : "Available metadata does not contain a reliable accounting-document indicator. Content analysis is not implemented in this phase.",
        processingRoute: "MANUAL_REVIEW",
        method: "METADATA_RULES",
      };
    }

    const confidence = confidenceFor(winner.exactMatches, winner.partialMatches);
    const supportingSignals = [
      `filename matched ${winner.rule.label}`,
      `file extension ${input.fileType.toLowerCase()}`,
      `MIME type ${input.mimeType}`,
    ];
    const lowConfidenceNote = confidence === "LOW" ? " The semantic filename match is weak, so manual review is required." : "";
    return {
      documentType: winner.rule.type,
      confidence,
      reasoning: `${supportingSignals.join("; ")}. This is a metadata-only classification, not content or AI analysis.${lowConfidenceNote}`,
      processingRoute: confidence === "LOW" ? "MANUAL_REVIEW" : processingRouteFor(winner.rule.type),
      method: "METADATA_RULES",
    };
  },
};
