import type { AccountingDocumentType, ClassificationConfidence, DocumentProcessingRoute } from "@prisma/client";

const configuredThreshold = process.env.DOCUMENT_CLASSIFICATION_CONFIDENCE_THRESHOLD;
export const CLASSIFICATION_CONFIDENCE_THRESHOLD: ClassificationConfidence = configuredThreshold === "HIGH" || configuredThreshold === "LOW" ? configuredThreshold : "MEDIUM";
export const CLASSIFIER_VERSION = "metadata-rules-v1";

export const ACCOUNTING_DOCUMENT_TYPE_LABELS: Record<AccountingDocumentType, string> = {
  BANK_STATEMENT: "Bank Statement",
  INVOICE: "Invoice",
  BILL: "Bill",
  RECEIPT: "Receipt",
  BALANCE_SHEET: "Balance Sheet",
  INCOME_STATEMENT: "Income Statement",
  TRIAL_BALANCE: "Trial Balance",
  GENERAL_LEDGER: "General Ledger",
  TAX_DOCUMENT: "Tax Document",
  PAYROLL_DOCUMENT: "Payroll Document",
  EXPENSE_REPORT: "Expense Report",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};

export const CLASSIFIABLE_MANUAL_TYPES: AccountingDocumentType[] = [
  "BANK_STATEMENT", "INVOICE", "BILL", "RECEIPT", "BALANCE_SHEET", "INCOME_STATEMENT",
  "TRIAL_BALANCE", "GENERAL_LEDGER", "TAX_DOCUMENT", "PAYROLL_DOCUMENT", "EXPENSE_REPORT", "OTHER",
];

export const PROCESSING_ROUTE_LABELS: Record<DocumentProcessingRoute, string> = {
  BANK_STATEMENT_PROCESSOR: "Bank Statement Processor",
  INVOICE_PROCESSOR: "Invoice Processor",
  BILL_PROCESSOR: "Bill Processor",
  RECEIPT_PROCESSOR: "Receipt Processor",
  FINANCIAL_STATEMENT_PROCESSOR: "Financial Statement Processor",
  GENERAL_LEDGER_PROCESSOR: "General Ledger Processor",
  TAX_DOCUMENT_PROCESSOR: "Tax Document Processor",
  PAYROLL_DOCUMENT_PROCESSOR: "Payroll Processor",
  EXPENSE_REPORT_PROCESSOR: "Expense Report Processor",
  OTHER_PROCESSOR: "Other Document Processor",
  MANUAL_REVIEW: "Manual Review",
};

export function processingRouteFor(type: AccountingDocumentType): DocumentProcessingRoute {
  switch (type) {
    case "BANK_STATEMENT": return "BANK_STATEMENT_PROCESSOR";
    case "INVOICE": return "INVOICE_PROCESSOR";
    case "BILL": return "BILL_PROCESSOR";
    case "RECEIPT": return "RECEIPT_PROCESSOR";
    case "BALANCE_SHEET":
    case "INCOME_STATEMENT":
    case "TRIAL_BALANCE": return "FINANCIAL_STATEMENT_PROCESSOR";
    case "GENERAL_LEDGER": return "GENERAL_LEDGER_PROCESSOR";
    case "TAX_DOCUMENT": return "TAX_DOCUMENT_PROCESSOR";
    case "PAYROLL_DOCUMENT": return "PAYROLL_DOCUMENT_PROCESSOR";
    case "EXPENSE_REPORT": return "EXPENSE_REPORT_PROCESSOR";
    case "OTHER": return "OTHER_PROCESSOR";
    default: return "MANUAL_REVIEW";
  }
}
