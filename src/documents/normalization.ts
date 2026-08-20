import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnedCompany } from "@/accounting/access";
import { getOwnedDocumentDetails } from "@/accounting/documents";
import { getDocumentStorage } from "@/storage/document-storage";
import type { NormalizedCandidateDraft, NormalizationConfidence, NormalizationResult } from "@/documents/normalization-types";
import type { NormalizedDocumentContent } from "@/documents/processing-types";
import { DOCUMENT_AI_PROVIDER, DocumentAINotConfiguredError, extractDocumentWithOpenAI } from "@/documents/ai-extraction";
import { processingRouteFor } from "@/documents/classification-config";

const DESCRIPTION_HEADERS = ["description", "details", "narration", "particulars", "memo", "transaction details", "remarks"];
const REFERENCE_HEADERS = ["reference", "ref", "reference no", "reference number", "transaction id", "invoice no", "invoice number", "document no", "document number", "cheque no", "check no"];
const DEBIT_HEADERS = ["debit", "dr", "withdrawal", "payment"];
const CREDIT_HEADERS = ["credit", "cr", "deposit", "receipt"];
const AMOUNT_HEADERS = ["amount", "value", "total", "transaction amount"];
const BALANCE_HEADERS = ["balance", "running balance", "closing balance", "available balance"];
const DATE_HEADERS = ["date", "transaction date", "posting date", "value date", "entry date"];
const CURRENCY_HEADERS = ["currency", "ccy", "currency code"];
const TYPE_HEADERS = ["transaction type", "type", "transaction"];

function cleanHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function findHeader(headers: string[], names: string[]) {
  const exact = headers.findIndex((h) => names.includes(h));
  if (exact >= 0) return exact;
  return headers.findIndex((h) => names.some((name) => h.includes(name)));
}

function parseMoney(value: unknown): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;
  let s = raw.replace(/[\s,]/g, "").replace(/[৳$€£¥₹]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-") || s.startsWith("+")) {
    negative = s.startsWith("-");
    s = s.slice(1);
  }
  if (!/^\d+(?:\.\d+)?$/.test(s)) return undefined;
  try {
    const decimal = new Prisma.Decimal(`${negative ? "-" : ""}${s}`);
    return decimal.toFixed(4).replace(/\.?(0+)$/, "").replace(/\.$/, "");
  } catch { return undefined; }
}

function parseDate(value: unknown): { date?: Date; confidence: NormalizationConfidence; warning?: string } {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { date: value, confidence: "HIGH" };
  const raw = cleanText(value);
  if (!raw) return { confidence: "LOW", warning: "Missing date" };
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? { confidence: "LOW", warning: "Unrecognized date format" } : { date: d, confidence: "HIGH" };
  }
  const parts = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (parts) {
    const a = Number(parts[1]); const b = Number(parts[2]); const y = Number(parts[3]);
    if (a > 12 && b <= 12) return { date: new Date(Date.UTC(y, b - 1, a)), confidence: "HIGH" };
    if (b > 12 && a <= 12) return { date: new Date(Date.UTC(y, a - 1, b)), confidence: "HIGH" };
    return { confidence: "LOW", warning: "Ambiguous date format" };
  }
  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(raw)) {
    const d = new Date(`${raw.replace(/,/g, "")} UTC`);
    if (!Number.isNaN(d.getTime())) return { date: d, confidence: "MEDIUM" };
  }
  return { confidence: "LOW", warning: "Unrecognized date format" };
}

function detectCurrency(values: unknown[], headers: string[], companyCurrency?: string) {
  const currencyIndex = findHeader(headers, CURRENCY_HEADERS);
  if (currencyIndex >= 0) {
    const value = cleanText(values[currencyIndex]).toUpperCase();
    if (/^[A-Z]{3}$/.test(value)) return { currency: value, confidence: "HIGH" as const };
  }
  const joined = values.map(cleanText).join(" ");
  const symbolMap: Array<[RegExp, string]> = [[/৳|BDT/i, "BDT"], [/\$|USD/i, "USD"], [/€|EUR/i, "EUR"], [/£|GBP/i, "GBP"], [/C\$|CAD/i, "CAD"]];
  for (const [pattern, currency] of symbolMap) if (pattern.test(joined)) return { currency, confidence: "MEDIUM" as const };
  return { currency: companyCurrency, confidence: companyCurrency ? "LOW" as const : "LOW" as const };
}

function maxConfidence(values: NormalizationConfidence[]): NormalizationConfidence {
  if (values.includes("LOW")) return "LOW";
  if (values.includes("MEDIUM")) return "MEDIUM";
  return "HIGH";
}

function isNonTransaction(values: unknown[]) {
  const text = values.map(cleanText).join(" ").toUpperCase();
  if (!text) return true;
  return /^(TOTAL|SUBTOTAL|BALANCE FORWARD|BROUGHT FORWARD|CARRIED FORWARD)\b/.test(text) || /\b(TOTAL|SUBTOTAL|BALANCE FORWARD)\b/.test(text) && values.filter((v) => cleanText(v)).length <= 3;
}

function buildTabularCandidates(sheetName: string | undefined, headersInput: unknown[], rows: unknown[][], companyCurrency?: string): NormalizedCandidateDraft[] {
  const headers = headersInput.map(cleanHeader);
  const dateIndex = findHeader(headers, DATE_HEADERS);
  const descIndex = findHeader(headers, DESCRIPTION_HEADERS);
  const refIndex = findHeader(headers, REFERENCE_HEADERS);
  const debitIndex = findHeader(headers, DEBIT_HEADERS);
  const creditIndex = findHeader(headers, CREDIT_HEADERS);
  const amountIndices = headers.map((h, i) => AMOUNT_HEADERS.some((n) => h === n || h.includes(n)) ? i : -1).filter((i) => i >= 0);
  const balanceIndex = findHeader(headers, BALANCE_HEADERS);
  const currencyIndex = findHeader(headers, CURRENCY_HEADERS);
  const typeIndex = findHeader(headers, TYPE_HEADERS);
  const out: NormalizedCandidateDraft[] = [];
  rows.forEach((row, rowIndex) => {
    if (isNonTransaction(row)) return;
    const warnings: string[] = [];
    const dateResult = dateIndex >= 0 ? parseDate(row[dateIndex]) : { confidence: "LOW" as const, warning: "Missing date" };
    if (dateResult.warning) warnings.push(dateResult.warning);
    const description = descIndex >= 0 ? cleanText(row[descIndex]) || undefined : undefined;
    if (!description) warnings.push("Missing description");
    const reference = refIndex >= 0 ? cleanText(row[refIndex]) || undefined : undefined;
    const debit = debitIndex >= 0 ? parseMoney(row[debitIndex]) : undefined;
    const credit = creditIndex >= 0 ? parseMoney(row[creditIndex]) : undefined;
    const amount = amountIndices.length === 1 ? parseMoney(row[amountIndices[0]]) : undefined;
    const balance = balanceIndex >= 0 ? parseMoney(row[balanceIndex]) : undefined;
    if (debit && credit) warnings.push("Both debit and credit are populated");
    if (amountIndices.length > 1) warnings.push("Multiple possible amount columns");
    const rawValues = row.map(cleanText);
    if (rawValues.some((v) => /^-/.test(v))) warnings.push("Negative value detected");
    const currencyResult = detectCurrency(row, headers, companyCurrency);
    if (companyCurrency && currencyResult.currency && currencyResult.currency !== companyCurrency && currencyResult.confidence !== "LOW") warnings.push("Currency differs from company currency");
    const transactionType = typeIndex >= 0 ? cleanText(row[typeIndex]) || undefined : undefined;
    const candidateSignal = Boolean(dateResult.date || description || reference || debit || credit || amount || balance);
    if (!candidateSignal) return;
    const confidence = maxConfidence([dateResult.confidence, description ? "HIGH" : "LOW", reference ? "MEDIUM" : "LOW", debit || credit ? "MEDIUM" : "LOW", amount ? "MEDIUM" : "LOW", currencyResult.confidence]);
    out.push({ sourceRowReference: `${sheetName ? `sheet:${sheetName}:` : ""}row:${rowIndex + 2}`, sourceSheetName: sheetName, sourceRowNumber: rowIndex + 2, date: dateResult.date, dateConfidence: dateResult.confidence, description, descriptionConfidence: description ? "HIGH" : "LOW", reference, referenceConfidence: reference ? "HIGH" : "LOW", debit, credit, amount, balance, currency: currencyResult.currency, currencyConfidence: currencyResult.confidence, transactionType, confidence, warnings, possibleDuplicate: false });
  });
  return out;
}

function buildPdfCandidates(pages: Array<{ pageNumber: number; text: string }>, companyCurrency?: string) {
  const out: NormalizedCandidateDraft[] = [];
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      if (isNonTransaction([line])) return;
      const tokens = line.split(/\s{2,}|\t+/).map((v) => v.trim()).filter(Boolean);
      const source = tokens.length > 1 ? tokens : line.split(/\s+/).filter(Boolean);
      const dateTokenIndex = source.findIndex((v) => parseDate(v).date);
      const amountTokens = source.map((v) => parseMoney(v)).filter((v): v is string => Boolean(v));
      if (dateTokenIndex < 0 && amountTokens.length === 0) return;
      const dateResult = dateTokenIndex >= 0 ? parseDate(source[dateTokenIndex]) : { confidence: "LOW" as const, warning: "Missing date" };
      const warnings = dateResult.warning ? [dateResult.warning] : [];
      const descriptionParts = source.filter((_, i) => i !== dateTokenIndex && !parseMoney(source[i]));
      const description = cleanText(descriptionParts.join(" ")) || undefined;
      if (!description) warnings.push("Missing description");
      if (amountTokens.length > 1) warnings.push("Multiple amount-like values detected");
      const currencyResult = detectCurrency(source, [], companyCurrency);
      const amount = amountTokens.length === 1 ? amountTokens[0] : undefined;
      out.push({ sourceRowReference: `page:${page.pageNumber}:line:${index + 1}`, sourcePageNumber: page.pageNumber, date: dateResult.date, dateConfidence: dateResult.confidence, description, descriptionConfidence: description ? "MEDIUM" : "LOW", reference: undefined, referenceConfidence: "LOW", amount, balance: undefined, debit: undefined, credit: undefined, currency: currencyResult.currency, currencyConfidence: currencyResult.confidence, confidence: maxConfidence([dateResult.confidence, description ? "MEDIUM" : "LOW", amount ? "MEDIUM" : "LOW", currencyResult.confidence]), transactionType: undefined, warnings, possibleDuplicate: false });
    });
  }
  return out;
}

function markDuplicates(candidates: NormalizedCandidateDraft[]) {
  const seen = new Map<string, number>();
  const signature = (c: NormalizedCandidateDraft) => [c.date?.toISOString().slice(0, 10) ?? "", (c.description ?? "").toLowerCase(), c.amount ?? c.debit ?? c.credit ?? "", (c.reference ?? "").toLowerCase()].join("|");
  return candidates.map((candidate) => {
    const key = signature(candidate);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return { ...candidate, possibleDuplicate: key !== "|||" && count > 1, warnings: count > 1 ? [...candidate.warnings, "Possible duplicate row"] : candidate.warnings };
  });
}

function isAIExtractionEnabled() {
  return DOCUMENT_AI_PROVIDER === "openai";
}

async function audit(organizationId: string, companyId: string, documentId: string, userId: string, action: string, details?: Prisma.InputJsonValue) {
  try {
    await prisma.documentAuditEvent.create({ data: { id: randomUUID(), organizationId, companyId, documentId, userId, action, details } });
  } catch {
    // Best-effort only; audit failures must never block normalization.
  }
}

export async function normalizeDocument(organizationId: string, companyId: string, documentId: string, userId?: string): Promise<NormalizationResult | { error: string }> {
  const document = await getOwnedDocumentDetails(organizationId, companyId, documentId);
  if (!document) return { error: "Document not found." };
  if (document.documentStatus !== "COMPLETED" || !document.processingResult?.extractedContentReference) return { error: "Document must be successfully processed before normalization." };
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { error: "Company not found." };
  const auditUserId = userId ?? document.uploadedById;
  try {
    const storage = getDocumentStorage();
    const raw = await storage.read(document.processingResult.extractedContentReference);
    const content = JSON.parse(raw.toString("utf8")) as NormalizedDocumentContent;
    // BUG FIX: the extractors (processors.ts) never write a `content.kind`
    // field at all, yet this function's dispatch below always branched on
    // `content.kind === "csv" | "excel" | "pdf" | "image"`. Since that field
    // was always `undefined`, NONE of those branches were ever reachable for
    // ANY document, of any type — normalization silently produced zero
    // candidates for every document ever processed, with no error surfaced
    // anywhere. `kind` must be derived from the document's real file type.
    const kind: "csv" | "excel" | "pdf" | "image" | "unsupported" =
      document.fileType === "CSV" ? "csv"
      : document.fileType === "XLSX" || document.fileType === "XLS" ? "excel"
      : document.fileType === "PDF" ? "pdf"
      : document.fileType === "JPG" || document.fileType === "JPEG" || document.fileType === "PNG" || document.fileType === "WEBP" || document.fileType === "TIFF" ? "image"
      : "unsupported";
    let candidates: NormalizedCandidateDraft[] = [];
    let sourceRowCount = 0;

    const aiEnabled = isAIExtractionEnabled();

    if (kind === "unsupported") {
      return { error: "This file type is not supported for transaction extraction." };
    }

    if (aiEnabled) {
      // OpenAI document understanding replaces the regex/header-matching
      // extraction below for every supported kind, including images (which
      // the old regex path could never handle at all).
      let imagePayload: { buffer: Buffer; mimeType: string } | undefined;
      if (kind === "image") {
        if (!document.storageKey) return { error: "Document storage reference is missing." };
        try {
          imagePayload = { buffer: await storage.read(document.storageKey), mimeType: document.mimeType };
        } catch {
          return { error: "Unable to read the original image for AI processing." };
        }
      }
      try {
        const result = await extractDocumentWithOpenAI({
          content,
          companyCurrency: company.currency,
          knownDocumentType: document.classification?.documentType,
          image: imagePayload,
        });
        candidates = result.transactions;
        sourceRowCount = candidates.length;

        // Persist the full structured AI result (including statement
        // findings, which do not fit the transaction-candidate table) next
        // to the deterministic extraction artifact.
        const aiReference = `document-ai-understanding/${companyId}/${document.id}/${randomUUID()}.json`;
        await storage.upload(aiReference, new Blob([JSON.stringify(result)], { type: "application/json" }));
        const previousReference = document.processingResult.aiUnderstandingReference;
        await prisma.documentProcessingResult.update({
          where: { documentId: document.id },
          data: {
            aiUnderstandingProvider: result.provider,
            aiUnderstandingModel: result.model,
            aiUnderstandingReference: aiReference,
            aiUnderstandingError: null,
            aiUnderstandingProcessedAt: new Date(),
          },
        });
        if (previousReference && previousReference !== aiReference) await storage.delete(previousReference).catch(() => undefined);

        // Reclassify from real content if the OpenAI read materially
        // disagrees with the fast filename-based pre-classification. The
        // pre-classification gate itself is left untouched (extraction
        // already ran by this point), this only corrects the *record*.
        if (document.classification && (document.classification.documentType !== result.documentType || document.classification.classifierMethod !== "OPENAI_CONTENT")) {
          await prisma.documentClassification.update({
            where: { documentId: document.id },
            data: {
              documentType: result.documentType,
              confidence: result.confidence === "HIGH" ? "HIGH" : result.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
              reasoning: result.reasoning || document.classification.reasoning,
              processingRoute: processingRouteFor(result.documentType),
              classifierMethod: "OPENAI_CONTENT",
              classifiedAt: new Date(),
            },
          });
        }
        await audit(organizationId, companyId, document.id, auditUserId, "AI_DOCUMENT_UNDERSTANDING_COMPLETED", { documentType: result.documentType, confidence: result.confidence, transactionCount: candidates.length, statementFindingCount: result.statementFindings.length, findingCount: result.findings.length });
      } catch (error) {
        const configured = !(error instanceof DocumentAINotConfiguredError);
        const message = error instanceof DocumentAINotConfiguredError ? error.message : "OpenAI document understanding failed. Please retry.";
        if (configured) console.error("AI document understanding failed", error);
        await prisma.documentProcessingResult.update({ where: { documentId: document.id }, data: { aiUnderstandingError: message, aiUnderstandingProcessedAt: new Date() } }).catch(() => undefined);
        await audit(organizationId, companyId, document.id, auditUserId, "AI_DOCUMENT_UNDERSTANDING_FAILED", { reason: message });
        return { error: message };
      }
    } else if (kind === "csv") {
      sourceRowCount = content.rows.length;
      // BUG FIX: content.rows is Array<{source, rowNumber, cells: string[]}>
      // and content.columns is Array<{source,index,name}> — buildTabularCandidates
      // needs plain arrays indexable by column position, not these wrapper objects.
      candidates = buildTabularCandidates(undefined, content.columns.map((c) => c.name), content.rows.map((r) => r.cells), company.currency);
    } else if (kind === "excel") {
      for (const sheet of content.sheets) {
        sourceRowCount += sheet.rows.length;
        // sheet.columns is already a plain string[] (raw header row), but
        // sheet.rows[i].cells is ExtractedCell[] — unwrap to plain values.
        candidates.push(...buildTabularCandidates(sheet.name, sheet.columns, sheet.rows.map((r) => r.cells.map((c) => (c.value == null ? "" : String(c.value)))), company.currency));
      }
    } else if (kind === "pdf") {
      sourceRowCount = content.pages.reduce((total, page) => total + String(page.text ?? "").split(/\r?\n/).filter(Boolean).length, 0);
      candidates = buildPdfCandidates(content.pages, company.currency);
    } else if (kind === "image") {
      return { error: "OpenAI AI processing is not configured. Set DOCUMENT_AI_PROVIDER=openai and OPENAI_API_KEY to process image documents." };
    }

    candidates = markDuplicates(candidates);
    const existing = await prisma.normalizedTransactionCandidate.findMany({ where: { documentId: document.id }, select: { id: true, sourceRowReference: true, manuallyCorrected: true } });
    const sourceKeys = new Set(candidates.map((c) => c.sourceRowReference));
    const existingByRef = new Map(existing.map((e) => [e.sourceRowReference, e]));

    // BUG FIX (P2028 "Transaction not found" on Vercel): this used to loop
    // through every candidate and `await` an individual upsert() one at a
    // time *inside* a single interactive $transaction. For any document with
    // more than a handful of AI-extracted transactions, that easily blew
    // past Prisma's default 5s interactive-transaction timeout (or lost the
    // pooled connection mid-transaction), which is exactly this error. Now:
    // new candidates go through one batched createMany() round trip, and
    // only rows that actually already exist (re-runs) are updated
    // individually, with a generous explicit timeout as a safety net either way.
    const toCreate = candidates.filter((c) => !existingByRef.get(c.sourceRowReference));
    const toUpdate = candidates.filter((c) => {
      const old = existingByRef.get(c.sourceRowReference);
      return old && !old.manuallyCorrected;
    });
    const candidateData = (candidate: NormalizedCandidateDraft) => ({
      organizationId,
      companyId,
      sourceSheetName: candidate.sourceSheetName,
      sourcePageNumber: candidate.sourcePageNumber,
      sourceRowNumber: candidate.sourceRowNumber,
      date: candidate.date,
      dateConfidence: candidate.dateConfidence,
      description: candidate.description,
      descriptionConfidence: candidate.descriptionConfidence,
      reference: candidate.reference,
      referenceConfidence: candidate.referenceConfidence,
      debit: candidate.debit,
      credit: candidate.credit,
      amount: candidate.amount,
      balance: candidate.balance,
      currency: candidate.currency,
      currencyConfidence: candidate.currencyConfidence,
      transactionType: candidate.transactionType,
      confidence: candidate.confidence,
      warnings: candidate.warnings,
      possibleDuplicate: candidate.possibleDuplicate,
    });

    await prisma.$transaction(async (tx) => {
      if (toCreate.length) {
        await tx.normalizedTransactionCandidate.createMany({
          data: toCreate.map((candidate) => ({ documentId: document.id, sourceRowReference: candidate.sourceRowReference, ...candidateData(candidate) })),
          skipDuplicates: true,
        });
      }
      for (const candidate of toUpdate) {
        await tx.normalizedTransactionCandidate.update({ where: { documentId_sourceRowReference: { documentId: document.id, sourceRowReference: candidate.sourceRowReference } }, data: candidateData(candidate) });
      }
      const stale = existing.filter((e) => !sourceKeys.has(e.sourceRowReference) && !e.manuallyCorrected).map((e) => e.id);
      if (stale.length) await tx.normalizedTransactionCandidate.deleteMany({ where: { id: { in: stale } } });
      await tx.aIReviewRecord.updateMany({ where: { candidate: { documentId: document.id } }, data: { status: "NOT_REVIEWED", contextVersion: "v1" } });
    }, { timeout: 30000, maxWait: 15000 });
    return { documentId: document.id, candidateCount: candidates.length, ignoredRowCount: Math.max(0, sourceRowCount - candidates.length), duplicateCount: candidates.filter((c) => c.possibleDuplicate).length, warningsCount: candidates.reduce((n, c) => n + c.warnings.length, 0) };
  } catch (error) {
    console.error("Document normalization failed", error);
    return { error: "Unable to normalize the processed document. Please retry." };
  }
}

export async function listOwnedCandidates(organizationId: string, companyId: string, documentId: string) {
  const rows = await prisma.normalizedTransactionCandidate.findMany({
    where: { documentId, organizationId, companyId, document: { organizationId, companyId, company: { organizationId } } },
    orderBy: { sourceRowReference: "asc" },
    include: { aiReview: { select: { status: true, contextVersion: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    sourceRowReference: row.sourceRowReference,
    sourceSheetName: row.sourceSheetName,
    sourcePageNumber: row.sourcePageNumber,
    sourceRowNumber: row.sourceRowNumber,
    date: row.date?.toISOString() ?? null,
    dateConfidence: row.dateConfidence,
    description: row.description,
    descriptionConfidence: row.descriptionConfidence,
    reference: row.reference,
    referenceConfidence: row.referenceConfidence,
    debit: row.debit?.toString() ?? null,
    credit: row.credit?.toString() ?? null,
    amount: row.amount?.toString() ?? null,
    balance: row.balance?.toString() ?? null,
    currency: row.currency,
    currencyConfidence: row.currencyConfidence,
    transactionType: row.transactionType,
    confidence: row.confidence,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    possibleDuplicate: row.possibleDuplicate,
    manuallyCorrected: row.manuallyCorrected,
    aiReviewStatus: row.aiReview?.status ?? "NOT_REVIEWED",
    aiReviewContextVersion: row.aiReview?.contextVersion ?? "v1",
  }));
}

function nullableText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = value.trim();
  return text ? text : null;
}

export async function updateNormalizedCandidate(organizationId: string, companyId: string, documentId: string, candidateId: string, input: {
  date?: string | null; description?: string | null; reference?: string | null; debit?: string | null; credit?: string | null; amount?: string | null; currency?: string | null;
}, userId: string) {
  const candidate = await prisma.normalizedTransactionCandidate.findFirst({ where: { id: candidateId, documentId, organizationId, companyId, document: { organizationId, companyId, company: { organizationId } } } });
  if (!candidate) return { ok: false as const, error: "Normalized row not found." };
  if (candidate.documentId !== documentId) return { ok: false as const, error: "Normalized row not found." };
  try {
    const parseOptionalDecimal = (value: string | null | undefined) => {
      if (value === undefined) return undefined;
      if (value === null || value.trim() === "") return null;
      const parsed = parseMoney(value);
      if (!parsed) throw new Error("Invalid amount");
      return parsed;
    };
    const date = input.date === undefined ? undefined : input.date === null || input.date.trim() === "" ? null : parseDate(input.date).date;
    if (input.date !== undefined && input.date && !date) return { ok: false as const, error: "Enter a valid unambiguous date." };
    const data = {
      date,
      description: input.description === undefined ? undefined : nullableText(input.description),
      reference: input.reference === undefined ? undefined : nullableText(input.reference),
      debit: parseOptionalDecimal(input.debit),
      credit: parseOptionalDecimal(input.credit),
      amount: parseOptionalDecimal(input.amount),
      currency: input.currency === undefined ? undefined : nullableText(input.currency)?.toUpperCase() ?? null,
      manuallyCorrected: true,
      correctedById: userId,
      correctedAt: new Date(),
    };
    const updated = await prisma.normalizedTransactionCandidate.update({ where: { id: candidate.id }, data });

    const review = await prisma.aIReviewRecord.findUnique({
      where: { candidateId: updated.id },
      select: { humanReviewStatus: true },
    });
    const latestSuggestion = await prisma.aIReviewSuggestion.findFirst({
      where: { candidateId: updated.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, model: true, contextVersion: true, confidence: true },
    });

    if (review) {
      await prisma.$transaction(async (tx) => {
        await tx.aIReviewRecord.update({
          where: { candidateId: updated.id },
          data: {
            status: "NOT_REVIEWED",
            humanReviewStatus: "PENDING_REVIEW",
            decision: null,
            reviewedById: null,
            reviewedAt: null,
            humanAccountId: null,
            humanDebit: null,
            humanCredit: null,
            humanAmount: null,
            humanNotes: null,
          },
        });

        await tx.aIReviewAudit.create({
          data: {
            candidateId: updated.id,
            suggestionId: latestSuggestion?.id ?? null,
            action: "EDITED",
            provider: latestSuggestion?.provider ?? null,
            model: latestSuggestion?.model ?? null,
            contextVersion: latestSuggestion?.contextVersion ?? null,
            confidence: latestSuggestion?.confidence ?? null,
            userId,
            previousHumanReviewStatus: review.humanReviewStatus,
            newHumanReviewStatus: "PENDING_REVIEW",
            relevantCorrection: "Normalized source transaction corrected by human; AI review requires re-review.",
          },
        });
      });
    }

    return { ok: true as const, candidate: { id: updated.id } };
  } catch {
    return { ok: false as const, error: "Unable to save the correction. Check the values and try again." };
  }
}

export async function getExtractedPreview(organizationId: string, companyId: string, documentId: string) {
  const document = await getOwnedDocumentDetails(organizationId, companyId, documentId);
  if (!document?.processingResult?.extractedContentReference) return null;
  try {
    const raw = await getDocumentStorage().read(document.processingResult.extractedContentReference);
    const content = JSON.parse(raw.toString("utf8")) as any;
    if (content.kind === "csv") return { kind: "csv" as const, columns: (content.columns ?? []).slice(0, 30), rows: (content.rows ?? []).slice(0, 10).map((r: unknown[]) => r.slice(0, 30)) };
    if (content.kind === "excel") return { kind: "excel" as const, sheets: (content.sheets ?? []).slice(0, 10).map((s: any) => ({ name: s.name, columns: (s.columns ?? []).slice(0, 30), rows: (s.rows ?? []).slice(0, 10).map((r: unknown[]) => r.slice(0, 30)) })) };
    if (content.kind === "pdf") return { kind: "pdf" as const, pages: (content.pages ?? []).slice(0, 5).map((p: any) => ({ pageNumber: p.pageNumber, text: String(p.text ?? "").split(/\r?\n/).filter(Boolean).slice(0, 15) })) };
    return { kind: "image" as const, requiresOcr: true };
  } catch (error) {
    console.error("Extracted preview failed", error);
    return null;
  }
}
