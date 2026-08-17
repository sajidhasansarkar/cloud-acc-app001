import type { NormalizationConfidence } from "@prisma/client";
import type { AIReviewPayload } from "@/ai/context";

export const ACCOUNTING_AI_PROVIDER = process.env.ACCOUNTING_AI_PROVIDER || "heuristic";
export const ACCOUNTING_AI_MODEL = process.env.ACCOUNTING_AI_MODEL || "accounting-review-v1";
export const ACCOUNTING_REVIEW_VERSION = "accounting-review-v1";

export type AccountingAISuggestion = {
  suggestedAccountId?: string;
  suggestedDebit?: string;
  suggestedCredit?: string;
  suggestedAmount?: string;
  explanation: string;
  confidence: NormalizationConfidence;
  warnings: string[];
  alternatives: Array<{
    accountId: string;
    code: string;
    name: string;
    confidence: NormalizationConfidence;
  }>;
};

export interface AccountingAIProvider {
  readonly provider: string;
  readonly model: string;
  review(payload: AIReviewPayload): Promise<AccountingAISuggestion>;
}

function tokenize(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9\u0080-\uFFFF]+/)
    .filter((token) => token.length >= 3);
}

function directionForAccount(type: string) {
  if (type === "ASSET" || type === "EXPENSE") return "debit" as const;
  if (type === "LIABILITY" || type === "EQUITY" || type === "REVENUE") return "credit" as const;
  return null;
}

/**
 * Provider-independent development fallback. It deliberately uses only the
 * minimized Phase 4B-4 context and never creates accounting records. A real
 * model provider can implement AccountingAIProvider without changing the
 * review/persistence/security layer.
 */
export class HeuristicAccountingAIProvider implements AccountingAIProvider {
  readonly provider = "heuristic";
  readonly model = ACCOUNTING_AI_MODEL;

  async review(payload: AIReviewPayload): Promise<AccountingAISuggestion> {
    const candidateText = [
      payload.transactionCandidate.description,
      payload.transactionCandidate.reference,
      payload.transactionCandidate.transactionType,
    ].filter(Boolean).join(" ");
    const candidateTokens = new Set(tokenize(candidateText));

    const ranked = payload.accountingContext.relevantAccounts
      .map((account) => {
        const accountTokens = new Set(tokenize(`${account.code} ${account.name} ${account.type} ${account.parentAccount || ""}`));
        let score = 0;
        for (const token of candidateTokens) if (accountTokens.has(token)) score += 3;
        for (const token of candidateTokens) {
          if ([...accountTokens].some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) score += 1;
        }
        if (candidateTokens.has("rent") && /rent/i.test(account.name)) score += 8;
        if (candidateTokens.has("payroll") && /payroll|wages|salary/i.test(account.name)) score += 8;
        if (candidateTokens.has("insurance") && /insurance/i.test(account.name)) score += 8;
        if (candidateTokens.has("bank") && /bank/i.test(account.name)) score += 6;
        return { account, score };
      })
      .sort((a, b) => b.score - a.score || a.account.code.localeCompare(b.account.code));

    const warnings = [...payload.transactionCandidate.warnings];
    if (!payload.transactionCandidate.description) warnings.push("Insufficient information: transaction description is missing.");
    if (!payload.transactionCandidate.date) warnings.push("Missing date.");
    if (!payload.transactionCandidate.reference) warnings.push("Missing reference.");
    if (payload.transactionCandidate.currency && payload.transactionCandidate.currency !== payload.companyContext.currency) {
      warnings.push("Currency mismatch with company currency.");
    }

    const primary = ranked[0];
    if (!primary || primary.score <= 0) {
      return {
        explanation: "No suitable company account could be identified from the available transaction context.",
        confidence: "LOW",
        warnings: [...new Set([...warnings, "NO_SUITABLE_ACCOUNT"])],
        alternatives: [],
      };
    }

    const confidence: NormalizationConfidence = primary.score >= 10 && payload.transactionCandidate.confidence === "HIGH" ? "HIGH" : primary.score >= 6 ? "MEDIUM" : "LOW";
    const amount = payload.transactionCandidate.amount;
    const debit = payload.transactionCandidate.debit;
    const credit = payload.transactionCandidate.credit;
    let suggestedDebit = debit;
    let suggestedCredit = credit;
    let suggestedAmount = amount;

    if (debit && credit) {
      warnings.push("Both debit and credit are populated; direction requires human review.");
    } else if (!debit && !credit && amount) {
      const direction = directionForAccount(primary.account.type);
      if (direction === "debit") suggestedDebit = amount;
      else if (direction === "credit") suggestedCredit = amount;
      else warnings.push("Debit/Credit direction requires human review.");
    } else if (!debit && !credit && !amount) {
      warnings.push("Amount is unavailable; amount review required.");
    }

    if (payload.transactionCandidate.confidence === "LOW") warnings.push("Source normalization confidence is LOW; human review is required.");
    if (warnings.some((warning) => /ambiguous|review|required|mismatch|insufficient|missing/i.test(warning))) {
      // Keep the model's confidence, but do not silently turn a warning into approval.
    }

    const alternatives = ranked.slice(1, 4).filter((item) => item.score > 0).map((item) => ({
      accountId: item.account.id,
      code: item.account.code,
      name: item.account.name,
      confidence: item.score >= 6 ? "MEDIUM" as const : "LOW" as const,
    }));

    return {
      suggestedAccountId: primary.account.id,
      suggestedDebit,
      suggestedCredit,
      suggestedAmount,
      explanation: `${primary.account.name} is suggested because it is the strongest match for the normalized transaction description and existing company Chart of Accounts context.`,
      confidence,
      warnings: [...new Set(warnings)],
      alternatives,
    };
  }
}

export function getAccountingAIProvider(): AccountingAIProvider {
  if (ACCOUNTING_AI_PROVIDER === "heuristic") return new HeuristicAccountingAIProvider();
  throw new Error(`Unsupported accounting AI provider: ${ACCOUNTING_AI_PROVIDER}`);
}

export const AI_REVIEW_BATCH_SIZES = [10, 25, 50] as const;
