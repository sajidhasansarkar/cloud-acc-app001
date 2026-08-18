CREATE TABLE "general_ledger_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "journalEntryLineId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "accountingPeriodId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "debit" DECIMAL(20,4) NOT NULL,
    "credit" DECIMAL(20,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "general_ledger_entries_journalEntryId_journalEntryLineId_key"
ON "general_ledger_entries"("journalEntryId", "journalEntryLineId");

CREATE INDEX "general_ledger_entries_organizationId_companyId_entryDate_idx"
ON "general_ledger_entries"("organizationId", "companyId", "entryDate");
CREATE INDEX "general_ledger_entries_companyId_accountId_entryDate_idx"
ON "general_ledger_entries"("companyId", "accountId", "entryDate");
CREATE INDEX "general_ledger_entries_companyId_fiscalYearId_accountingPeriodId_entryDate_idx"
ON "general_ledger_entries"("companyId", "fiscalYearId", "accountingPeriodId", "entryDate");
CREATE INDEX "general_ledger_entries_journalEntryId_idx"
ON "general_ledger_entries"("journalEntryId");
CREATE INDEX "general_ledger_entries_journalEntryLineId_idx"
ON "general_ledger_entries"("journalEntryLineId");

ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_journalEntryId_fkey"
FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_journalEntryLineId_fkey"
FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_fiscalYearId_fkey"
FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "general_ledger_entries"
ADD CONSTRAINT "general_ledger_entries_accountingPeriodId_fkey"
FOREIGN KEY ("accountingPeriodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
