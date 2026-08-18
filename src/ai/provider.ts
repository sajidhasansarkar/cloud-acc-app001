import OpenAI from "openai";
import type { NormalizationConfidence } from "@prisma/client";
import type { AIReviewPayload } from "@/ai/context";

export const ACCOUNTING_AI_PROVIDER = process.env.ACCOUNTING_AI_PROVIDER || "heuristic";
export const ACCOUNTING_AI_MODEL =
  process.env.ACCOUNTING_AI_MODEL ||
  (process.env.ACCOUNTING_AI_PROVIDER === "openai" ? "gpt-4o-mini" : "accounting-review-v1");
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

// OpenAI's structured-output schema. Deliberately narrow: the model only
// picks an account, explains itself, and flags concerns — it never
// generates monetary values. Debit/credit/amount are always taken verbatim
// from the normalized transaction candidate (see `review()` below), so a
// hallucinated number can never reach the persistence layer in
// review.ts, which independently re-validates everything against the
// candidate and the company's Chart of Accounts regardless.
const openAISuggestionSchema = {
  type: "object",
  properties: {
    suggestedAccountId: {
      type: ["string", "null"],
      description: "The id of the single best-matching account from accountingContext.relevantAccounts, or null if none is a reasonable match.",
    },
    confidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW"],
    },
    explanation: {
      type: "string",
      description: "One or two sentences explaining why this account was chosen.",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Any concerns a human reviewer should know about (ambiguity, missing context, unusual transaction, etc). Empty array if none.",
    },
    alternativeAccountIds: {
      type: "array",
      items: { type: "string" },
      description: "Up to 3 other plausible account ids from relevantAccounts, ordered best first, excluding suggestedAccountId.",
    },
  },
  required: ["suggestedAccountId", "confidence", "explanation", "warnings", "alternativeAccountIds"],
  additionalProperties: false,
} as const;

type OpenAISuggestionResponse = {
  suggestedAccountId?: string | null;
  confidence: NormalizationConfidence;
  explanation: string;
  warnings: string[];
  alternativeAccountIds: string[];
};

function buildOpenAIPrompt(payload: AIReviewPayload): string {
  return [
    "You are an accounting assistant helping a bookkeeper map a bank/document transaction to the correct account in a company's Chart of Accounts.",
    "You must choose only from the accounts listed in `relevantAccounts` below — never invent an account id, code, or name.",
    "You are not authoritative: a human always reviews and can accept, edit, or reject your suggestion. If you are unsure, say so in `warnings` and lower your confidence.",
    "",
    "Company context:",
    JSON.stringify(payload.companyContext, null, 2),
    "",
    "Transaction candidate to classify:",
    JSON.stringify(payload.transactionCandidate, null, 2),
    "",
    "Relevant accounts (choose suggestedAccountId from these `id` values only):",
    JSON.stringify(payload.accountingContext.relevantAccounts, null, 2),
    "",
    "Respond with a single JSON object matching the provided response schema.",
  ].join("\n");
}

/**
 * OpenAI-backed provider. Implements the same AccountingAIProvider
 * contract as the heuristic fallback, so nothing in review.ts,
 * persistence, or the audit trail needs to change.
 *
 * Design choice: OpenAI only ever selects an account and explains/flags —
 * it never generates suggestedDebit/suggestedCredit/suggestedAmount. Those
 * always come straight from the normalized transactionCandidate, which
 * both avoids hallucinated monetary values and satisfies review.ts's
 * validateAgainstCandidate() check, which requires suggested amounts to
 * exactly match the source candidate whenever one is present.
 */
export class OpenAIAccountingAIProvider implements AccountingAIProvider {
  readonly provider = "openai";
  readonly model = ACCOUNTING_AI_MODEL;

  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    this.client = new OpenAI({ apiKey });
  }

  async review(payload: AIReviewPayload): Promise<AccountingAISuggestion> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      messages: [{ role: "user", content: buildOpenAIPrompt(payload) }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "accounting_review_suggestion",
          schema: openAISuggestionSchema,
          strict: true,
        },
      },
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned an empty response.");

    let parsed: OpenAISuggestionResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("OpenAI returned a response that could not be parsed as JSON.");
    }

    const relevantById = new Map(payload.accountingContext.relevantAccounts.map((account) => [account.id, account]));
    const warnings = [...parsed.warnings];

    if (!payload.transactionCandidate.description) warnings.push("Insufficient information: transaction description is missing.");
    if (!payload.transactionCandidate.date) warnings.push("Missing date.");
    if (!payload.transactionCandidate.reference) warnings.push("Missing reference.");
    if (payload.transactionCandidate.currency && payload.transactionCandidate.currency !== payload.companyContext.currency) {
      warnings.push("Currency mismatch with company currency.");
    }

    let suggestedAccountId = parsed.suggestedAccountId || undefined;
    if (suggestedAccountId && !relevantById.has(suggestedAccountId)) {
      // OpenAI hallucinated an id outside the provided list — do not trust it.
      // review.ts would reject this anyway, but fail closed here with a
      // clearer signal and fall back to "no suitable account".
      suggestedAccountId = undefined;
      warnings.push("AI suggested an account outside the provided context; treated as no match.");
    }

    if (!suggestedAccountId) {
      return {
        explanation: parsed.explanation || "No suitable company account could be identified from the available transaction context.",
        confidence: "LOW",
        warnings: [...new Set(warnings.length ? warnings : ["NO_SUITABLE_ACCOUNT"])],
        alternatives: [],
      };
    }

    const account = relevantById.get(suggestedAccountId)!;
    const amount = payload.transactionCandidate.amount;
    const debit = payload.transactionCandidate.debit;
    const credit = payload.transactionCandidate.credit;
    let suggestedDebit = debit;
    let suggestedCredit = credit;
    const suggestedAmount = amount;

    if (debit && credit) {
      warnings.push("Both debit and credit are populated; direction requires human review.");
    } else if (!debit && !credit && amount) {
      const direction = directionForAccount(account.type);
      if (direction === "debit") suggestedDebit = amount;
      else if (direction === "credit") suggestedCredit = amount;
      else warnings.push("Debit/Credit direction requires human review.");
    } else if (!debit && !credit && !amount) {
      warnings.push("Amount is unavailable; amount review required.");
    }

    if (payload.transactionCandidate.confidence === "LOW") warnings.push("Source normalization confidence is LOW; human review is required.");

    const alternatives = (parsed.alternativeAccountIds || [])
      .filter((id) => id !== suggestedAccountId)
      .map((id) => relevantById.get(id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .slice(0, 3)
      .map((candidate) => ({
        accountId: candidate.id,
        code: candidate.code,
        name: candidate.name,
        confidence: "MEDIUM" as const,
      }));

    const confidence: NormalizationConfidence = ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence)
      ? parsed.confidence
      : "LOW";

    return {
      suggestedAccountId,
      suggestedDebit,
      suggestedCredit,
      suggestedAmount,
      explanation: parsed.explanation || `${account.name} is suggested based on the normalized transaction description and company Chart of Accounts context.`,
      confidence,
      warnings: [...new Set(warnings)],
      alternatives,
    };
  }
}

export function getAccountingAIProvider(): AccountingAIProvider {
  if (ACCOUNTING_AI_PROVIDER === "heuristic") return new HeuristicAccountingAIProvider();
  if (ACCOUNTING_AI_PROVIDER === "openai") return new OpenAIAccountingAIProvider();
  throw new Error(`Unsupported accounting AI provider: ${ACCOUNTING_AI_PROVIDER}`);
}

export const AI_REVIEW_BATCH_SIZES = [10, 25, 50] as const;
