import { prisma } from "@/lib/prisma";

/**
 * Ownership-chain lookups for the fiscal year / accounting period module.
 *
 * The rule enforced everywhere in this module: Authenticated User →
 * Organization → Company → FiscalYear → AccountingPeriod. A bare id coming
 * from the browser (companyId, fiscalYearId, periodId) is never trusted on
 * its own — every read/write re-derives ownership from the caller's
 * organizationId first. These helpers are the single place that does that,
 * so every function in fiscal-years.ts / accounting-periods.ts uses the
 * same rule instead of re-implementing it slightly differently each time.
 */

// A company scoped to the caller's organization, or null if it doesn't
// exist / doesn't belong to that organization. Never throws — callers
// decide how to report "not found" vs. "not yours" (deliberately the same
// message either way, so as not to leak which ids exist in other orgs).
export async function getOwnedCompany(organizationId: string, companyId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, organizationId },
  });
}

// A fiscal year scoped to a specific company, which itself must belong to
// the caller's organization. Both hops are checked in one query.
export async function getOwnedFiscalYear(
  organizationId: string,
  companyId: string,
  fiscalYearId: string
) {
  return prisma.fiscalYear.findFirst({
    where: {
      id: fiscalYearId,
      companyId,
      company: { organizationId },
    },
  });
}

// An accounting period scoped to a specific company + organization. Its
// fiscalYearId is trusted from the period row itself (not re-validated
// against a client-supplied fiscalYearId), since the row already went
// through this same ownership check when it was created.
export async function getOwnedAccountingPeriod(
  organizationId: string,
  companyId: string,
  periodId: string
) {
  return prisma.accountingPeriod.findFirst({
    where: {
      id: periodId,
      companyId,
      company: { organizationId },
    },
  });
}

// A chart-of-accounts account scoped to a specific company, which itself
// must belong to the caller's organization. Same rule as everywhere else
// in this file: a bare accountId is never trusted on its own.
export async function getOwnedAccount(
  organizationId: string,
  companyId: string,
  accountId: string
) {
  return prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
      company: { organizationId },
    },
  });
}

// A journal entry (Phase 4A-1) scoped to a specific company, which itself
// must belong to the caller's organization. Same rule as everywhere else
// in this file: a bare journalEntryId is never trusted on its own. Lines
// are included since almost every caller needs them (balance checks,
// display) and it avoids a second round trip. fiscalYear / accountingPeriod
// / createdBy are included too (Phase 4A-2 basic detail screen displays all
// three) — createdBy deliberately selects only { id, name }, never
// email/passwordHash (spec section 12).
/**
 * Fetches a journal entry by id while deriving its company from the
 * authenticated organization. This is the safer form for write/validation
 * paths: the browser does not get to choose the company that owns the entry.
 */
export async function getOwnedJournalEntryById(
  organizationId: string,
  journalEntryId: string
) {
  return prisma.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      company: { organizationId },
    },
    include: {
      lines: { include: { account: true }, orderBy: { lineNumber: "asc" } },
      fiscalYear: true,
      accountingPeriod: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function getOwnedJournalEntry(
  organizationId: string,
  companyId: string,
  journalEntryId: string
) {
  return prisma.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      companyId,
      company: { organizationId },
    },
    include: {
      // Lines in display order (spec section 3/14 — Journal Lines table
      // and Journal Entry Details both need account code/name, not just
      // accountId, so the relation is included here rather than every
      // caller re-fetching the Chart of Accounts separately).
      lines: { include: { account: true }, orderBy: { lineNumber: "asc" } },
      fiscalYear: true,
      accountingPeriod: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}
