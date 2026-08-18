import { Prisma, type NormalizationConfidence, type JournalPreparationStatus, type AccountMappingSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnedAccount, getOwnedCompany, getOwnedTransactionCandidate } from "@/accounting/access";
import { getAccountingAIProvider, ACCOUNTING_REVIEW_VERSION } from "@/ai/provider";


type Alternative = { accountId: string; code: string; name: string; confidence: NormalizationConfidence; side: "DEBIT" | "CREDIT" };

type MappingResult = {
  ok: true;
  mapping: Awaited<ReturnType<typeof getMapping>>;
} | { ok: false; error: string };

function unique<T>(items: T[]) { return [...new Set(items)]; }

async function getMapping(organizationId: string, companyId: string, candidateId: string) {
  return prisma.transactionAccountMapping.findUnique({
    where: { candidateId },
    include: {
      aiDebitAccount: { select: { id: true, code: true, name: true, type: true } },
      aiCreditAccount: { select: { id: true, code: true, name: true, type: true } },
      selectedDebitAccount: { select: { id: true, code: true, name: true, type: true } },
      selectedCreditAccount: { select: { id: true, code: true, name: true, type: true } },
      userSelectedBy: { select: { id: true, name: true } },
    },
  }).then((row) => row && row.companyId === companyId && row.organizationId === organizationId ? row : null);
}

async function validateAccountIds(organizationId: string, companyId: string, ids: string[]) {
  const wanted = unique(ids.filter(Boolean));
  if (!wanted.length) return new Map<string, { id: string; code: string; name: string; type: string }>();
  const rows = await prisma.account.findMany({
    where: { id: { in: wanted }, companyId, company: { organizationId }, isActive: true },
    select: { id: true, code: true, name: true, type: true },
  });
  if (rows.length !== wanted.length) throw new Error("One or more accounts are not available in this company.");
  return new Map(rows.map((row) => [row.id, row]));
}

async function findCounterpartAccount(companyId: string, organizationId: string, candidate: { transactionType: string | null; description: string | null }, side: "DEBIT" | "CREDIT") {
  const text = `${candidate.transactionType ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  const patterns = side === "DEBIT"
    ? (/(invoice|sale|customer|receivable)/.test(text) ? ["accounts receivable", "receivable", "customer"] : ["cash", "bank"])
    : (/(invoice|bill|purchase|vendor|payable|expense|payment)/.test(text) ? ["cash", "bank", "accounts payable", "payable"] : ["cash", "bank"]);
  for (const pattern of patterns) {
    const account = await prisma.account.findFirst({
      where: { companyId, company: { organizationId }, isActive: true, OR: [{ name: { contains: pattern, mode: "insensitive" } }, { description: { contains: pattern, mode: "insensitive" } }] },
      select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" },
    });
    if (account) return account;
  }
  return null;
}

function chooseSide(candidate: { debit: Prisma.Decimal | null; credit: Prisma.Decimal | null; amount: Prisma.Decimal | null }, suggestedDebit?: string, suggestedCredit?: string) {
  if (candidate.debit?.gt(0)) return "DEBIT" as const;
  if (candidate.credit?.gt(0)) return "CREDIT" as const;
  if (suggestedDebit) return "DEBIT" as const;
  if (suggestedCredit) return "CREDIT" as const;
  return null;
}

export async function mapTransactionToAccounts(organizationId: string, companyId: string, documentId: string, candidateId: string, userId: string, force = false): Promise<MappingResult> {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false, error: "Company not found." };
  const candidate = await getOwnedTransactionCandidate(organizationId, company.id, documentId, candidateId);
  if (!candidate) return { ok: false, error: "Transaction candidate not found." };

  const existing = await getMapping(organizationId, company.id, candidateId);
  if (existing && !force && (existing.status === "MAPPED" || existing.status === "READY_FOR_JOURNAL" || existing.status === "NEEDS_REVIEW" || existing.status === "PARTIAL")) {
    return { ok: true, mapping: existing };
  }

  const aiSuggestion = await prisma.aIReviewSuggestion.findFirst({
    where: { candidateId }, orderBy: { createdAt: "desc" }, include: { suggestedAccount: { select: { id: true, code: true, name: true, type: true } } },
  });
  if (!aiSuggestion) return { ok: false, error: "AI understanding is not available for this transaction yet." };

  const audit = (action: string, details: Record<string, unknown>) => prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, documentId, userId, action, details } });
  await audit("ACCOUNT_MAPPING_STARTED", { transactionId: candidateId, reprocessing: force });

  try {
    const provider = getAccountingAIProvider();
    const providerInfo = provider.provider;
    const suggested = aiSuggestion.suggestedAccountId ? await validateAccountIds(organizationId, company.id, [aiSuggestion.suggestedAccountId]) : new Map();
    const primary = aiSuggestion.suggestedAccountId ? suggested.get(aiSuggestion.suggestedAccountId) : null;
    if (aiSuggestion.suggestedAccountId && !primary) throw new Error("The AI suggestion references an account outside this company.");

    const side = chooseSide(candidate, aiSuggestion.suggestedDebit?.toString(), aiSuggestion.suggestedCredit?.toString());
    const debitAccount = side === "DEBIT" ? primary : await findCounterpartAccount(company.id, organizationId, candidate, "DEBIT");
    const creditAccount = side === "CREDIT" ? primary : await findCounterpartAccount(company.id, organizationId, candidate, "CREDIT");

    const alternativesRaw = Array.isArray(aiSuggestion.alternatives) ? aiSuggestion.alternatives : [];
    const alternativeIds = alternativesRaw.map((a) => a.accountId);
    const alternativeAccounts = await validateAccountIds(organizationId, company.id, alternativeIds);
    const alternatives: Alternative[] = alternativesRaw.filter((a) => alternativeAccounts.has(a.accountId)).map((a) => ({ accountId: a.accountId, code: a.code, name: a.name, confidence: a.confidence, side: side ?? "DEBIT" }));

    const warnings = [...new Set([...(Array.isArray(aiSuggestion.warnings) ? aiSuggestion.warnings.map(String) : []), ...(candidate.possibleDuplicate ? ["Possible duplicate transaction detected; review before proceeding."] : []), ...(!debitAccount ? ["Debit account could not be confidently identified."] : []), ...(!creditAccount ? ["Credit account could not be confidently identified."] : [])])];
    const debitConfidence = debitAccount ? (side === "DEBIT" ? aiSuggestion.confidence : "MEDIUM") : null;
    const creditConfidence = creditAccount ? (side === "CREDIT" ? aiSuggestion.confidence : "MEDIUM") : null;
    const status: JournalPreparationStatus = debitAccount && creditAccount && aiSuggestion.confidence !== "LOW" && warnings.length === 0 ? "READY_FOR_JOURNAL" : debitAccount || creditAccount ? "PARTIAL" : "NEEDS_REVIEW";

    const row = await prisma.transactionAccountMapping.upsert({
      where: { candidateId },
      create: {
        candidateId, documentId, organizationId, companyId: company.id, status,
        aiDebitAccountId: debitAccount?.id ?? null, aiCreditAccountId: creditAccount?.id ?? null,
        selectedDebitAccountId: existing?.selectedDebitAccountId ?? null, selectedCreditAccountId: existing?.selectedCreditAccountId ?? null,
        debitSource: existing?.selectedDebitAccountId ? "USER" : debitAccount ? "AI" : null,
        creditSource: existing?.selectedCreditAccountId ? "USER" : creditAccount ? "AI" : null,
        debitConfidence, creditConfidence, reasoning: aiSuggestion.explanation,
        alternatives: alternatives as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        duplicateWarning: candidate.possibleDuplicate,
        taxContext: null,
        aiMappedAt: new Date(),
      },
      update: {
        status,
        aiDebitAccountId: debitAccount?.id ?? null, aiCreditAccountId: creditAccount?.id ?? null,
        debitConfidence, creditConfidence, reasoning: aiSuggestion.explanation,
        alternatives: alternatives as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        duplicateWarning: candidate.possibleDuplicate,
        aiMappedAt: new Date(),
        debitSource: existing?.selectedDebitAccountId ? "USER" : debitAccount ? "AI" : null,
        creditSource: existing?.selectedCreditAccountId ? "USER" : creditAccount ? "AI" : null,
      },
    });
    await audit("ACCOUNT_MAPPING_COMPLETED", { transactionId: candidateId, status, provider: providerInfo, contextVersion: ACCOUNTING_REVIEW_VERSION, debitAccountId: debitAccount?.id ?? null, creditAccountId: creditAccount?.id ?? null });
    return { ok: true, mapping: await getMapping(organizationId, company.id, row.candidateId) } as MappingResult;
  } catch (error) {
    await prisma.transactionAccountMapping.upsert({ where: { candidateId }, create: { candidateId, documentId, organizationId, companyId: company.id, status: "FAILED", alternatives: [], warnings: ["Account mapping failed."] }, update: { status: "FAILED", warnings: ["Account mapping failed."] } });
    await audit("ACCOUNT_MAPPING_FAILED", { transactionId: candidateId, reason: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: error instanceof Error && /outside|unavailable|not available/i.test(error.message) ? error.message : "Account mapping failed. Please retry." };
  }
}

export async function searchCompanyAccounts(organizationId: string, companyId: string, query: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;
  const q = query.trim();
  if (!q) return prisma.account.findMany({ where: { companyId: company.id, isActive: true }, select: { id: true, code: true, name: true, type: true, subtype: true, description: true }, orderBy: { code: "asc" }, take: 50 });
  return prisma.account.findMany({ where: { companyId: company.id, isActive: true, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { type: { contains: q, mode: "insensitive" } }, { subtype: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, name: true, type: true, subtype: true, description: true }, orderBy: { code: "asc" }, take: 50 });
}

export async function selectMappedAccount(organizationId: string, companyId: string, documentId: string, candidateId: string, side: "DEBIT" | "CREDIT", accountId: string, userId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const candidate = await getOwnedTransactionCandidate(organizationId, company.id, documentId, candidateId);
  if (!candidate) return { ok: false as const, error: "Transaction candidate not found." };
  const account = await getOwnedAccount(organizationId, company.id, accountId);
  if (!account || !account.isActive) return { ok: false as const, error: "Account not found for this company." };
  const existing = await getMapping(organizationId, company.id, candidateId);
  if (!existing) return { ok: false as const, error: "Run account mapping before selecting an account." };
  const data = side === "DEBIT" ? { selectedDebitAccountId: account.id, debitSource: "USER" as AccountMappingSource, userSelectedById: userId, userSelectedAt: new Date() } : { selectedCreditAccountId: account.id, creditSource: "USER" as AccountMappingSource, userSelectedById: userId, userSelectedAt: new Date() };
  const nextDebit = side === "DEBIT" ? account.id : existing.selectedDebitAccountId ?? existing.aiDebitAccountId;
  const nextCredit = side === "CREDIT" ? account.id : existing.selectedCreditAccountId ?? existing.aiCreditAccountId;
  const status = nextDebit && nextCredit ? "MAPPED" : "PARTIAL";
  await prisma.transactionAccountMapping.update({ where: { id: existing.id }, data: { ...data, status } });
  await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, documentId, userId, action: "ACCOUNT_MAPPING_CHANGED", details: { transactionId: candidateId, side, previousAccountId: side === "DEBIT" ? existing.selectedDebitAccountId ?? existing.aiDebitAccountId : existing.selectedCreditAccountId ?? existing.aiCreditAccountId, newAccountId: account.id } } });
  return { ok: true as const, mapping: await getMapping(organizationId, company.id, candidateId) };
}

export async function clearMappedAccount(organizationId: string, companyId: string, documentId: string, candidateId: string, side: "DEBIT" | "CREDIT", userId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const existing = await getMapping(organizationId, company.id, candidateId);
  if (!existing) return { ok: false as const, error: "Mapping not found." };
  const data = side === "DEBIT" ? { selectedDebitAccountId: null, debitSource: null } : { selectedCreditAccountId: null, creditSource: null };
  const nextDebit = side === "DEBIT" ? existing.aiDebitAccountId : existing.selectedDebitAccountId ?? existing.aiDebitAccountId;
  const nextCredit = side === "CREDIT" ? existing.aiCreditAccountId : existing.selectedCreditAccountId ?? existing.aiCreditAccountId;
  await prisma.transactionAccountMapping.update({ where: { id: existing.id }, data: { ...data, status: nextDebit && nextCredit ? "MAPPED" : "PARTIAL" } });
  await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, documentId, userId, action: "ACCOUNT_MAPPING_REJECTED", details: { transactionId: candidateId, side, action: "CLEARED_USER_SELECTION" } } });
  return { ok: true as const, mapping: await getMapping(organizationId, company.id, candidateId) };
}

export async function acceptMappedAccounts(organizationId: string, companyId: string, documentId: string, candidateId: string, userId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return { ok: false as const, error: "Company not found." };
  const candidate = await getOwnedTransactionCandidate(organizationId, company.id, documentId, candidateId);
  if (!candidate) return { ok: false as const, error: "Transaction candidate not found." };
  const existing = await getMapping(organizationId, company.id, candidateId);
  if (!existing) return { ok: false as const, error: "Account mapping not found." };
  const debitId = existing.selectedDebitAccountId ?? existing.aiDebitAccountId;
  const creditId = existing.selectedCreditAccountId ?? existing.aiCreditAccountId;
  if (!debitId || !creditId) return { ok: false as const, error: "Account mapping requires review." };
  if (existing.duplicateWarning) return { ok: false as const, error: "Possible duplicate transaction detected; review before accepting." };
  const status = existing.debitConfidence === "LOW" || existing.creditConfidence === "LOW" ? "NEEDS_REVIEW" : "READY_FOR_JOURNAL";
  if (status === "NEEDS_REVIEW") return { ok: false as const, error: "Low-confidence account mapping requires review." };
  await prisma.transactionAccountMapping.update({ where: { id: existing.id }, data: { status, userSelectedById: userId, userSelectedAt: new Date() } });
  await prisma.documentAuditEvent.create({ data: { organizationId, companyId: company.id, documentId, userId, action: "ACCOUNT_MAPPING_ACCEPTED", details: { transactionId: candidateId, debitAccountId: debitId, creditAccountId: creditId } } });
  return { ok: true as const, mapping: await getMapping(organizationId, company.id, candidateId) };
}

export async function listTransactionMappings(organizationId: string, companyId: string, documentId: string) {
  const company = await getOwnedCompany(organizationId, companyId);
  if (!company) return null;
  return prisma.normalizedTransactionCandidate.findMany({
    where: { id: { not: undefined }, documentId, companyId: company.id, organizationId, document: { id: documentId, companyId: company.id, organizationId } },
    orderBy: [{ sourcePageNumber: "asc" }, { sourceRowNumber: "asc" }, { createdAt: "asc" }],
    include: {
      accountMapping: { include: { aiDebitAccount: true, aiCreditAccount: true, selectedDebitAccount: true, selectedCreditAccount: true, userSelectedBy: { select: { id: true, name: true } } } },
      aiReview: { include: { suggestions: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
}
