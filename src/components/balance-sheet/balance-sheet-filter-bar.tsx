import type { FiscalYear } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function BalanceSheetFilterBar({
  accounts,
  fiscalYears,
  values,
}: {
  accounts: { id: string; code: string; name: string }[];
  fiscalYears: Pick<FiscalYear, "id" | "name" | "startDate" | "endDate">[];
  values: { asOfDate: string; fiscalYearId?: string; accountId?: string; accountSearch?: string };
}) {
  const selectedFiscalYear = fiscalYears.find((year) => year.id === values.fiscalYearId);

  return (
    <form method="get" className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Report Filters</h2>
          <p className="text-xs text-ink-500">Values are calculated from posted General Ledger activity only.</p>
        </div>
        {selectedFiscalYear ? (
          <p className="text-xs text-ink-500">
            Fiscal year: <span className="font-medium text-ink-700">{selectedFiscalYear.name}</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">As of Date</span>
          <Input
            name="asOfDate"
            type="date"
            required
            min={selectedFiscalYear ? isoDate(selectedFiscalYear.startDate) : undefined}
            max={selectedFiscalYear ? isoDate(selectedFiscalYear.endDate) : undefined}
            defaultValue={values.asOfDate}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Fiscal Year</span>
          <Select name="fiscalYearId" defaultValue={values.fiscalYearId ?? ""}>
            <option value="">All fiscal years</option>
            {fiscalYears.map((year) => (
              <option key={year.id} value={year.id}>{year.name}</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Account</span>
          <Select name="accountId" defaultValue={values.accountId ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Account Search</span>
          <Input name="accountSearch" defaultValue={values.accountSearch} placeholder="Code or account name" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm">Apply filters</Button>
        <a href="?" className="text-xs font-medium text-ink-500 hover:text-ink-800">Clear</a>
      </div>
    </form>
  );
}
