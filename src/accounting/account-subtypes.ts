import type { AccountType } from "@prisma/client";

/**
 * Suggested subtypes per AccountType (Phase 3A-1).
 *
 * Account.subtype is a plain, unconstrained string column (see the comment
 * on the Account model in prisma/schema.prisma) — this list exists purely
 * to power a future "pick a subtype" dropdown with sensible defaults per
 * type. It is guidance, not validation: nothing in this phase rejects a
 * subtype that isn't on this list, and a future phase/company is free to
 * introduce its own without a schema change.
 */
export const SUGGESTED_ACCOUNT_SUBTYPES: Record<AccountType, string[]> = {
  ASSET: ["Cash", "Bank", "Accounts Receivable", "Inventory", "Fixed Asset"],
  LIABILITY: ["Accounts Payable", "Loan", "Tax Payable"],
  EQUITY: ["Owner Equity", "Retained Earnings"],
  REVENUE: ["Sales", "Service Revenue"],
  EXPENSE: ["Rent", "Utilities", "Salaries", "Office Expense"],
};

// Convenience for UI code that wants a flat list regardless of type.
export function getSuggestedSubtypes(type: AccountType): string[] {
  return SUGGESTED_ACCOUNT_SUBTYPES[type];
}
