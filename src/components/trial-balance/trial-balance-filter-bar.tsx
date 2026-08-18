import type { AccountingPeriod, FiscalYear } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function TrialBalanceFilterBar({
  accounts,
  fiscalYears,
  accountingPeriods,
  values,
}: {
  accounts: { id: string; code: string; name: string }[];
  fiscalYears: FiscalYear[];
  accountingPeriods: AccountingPeriod[];
  values: {
    accountId?: string;
    accountSearch?: string;
    dateFrom?: string;
    dateTo?: string;
    fiscalYearId?: string;
    accountingPeriodId?: string;
  };
}) {
  return (
    <form method="get" className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="space-y-1.5 xl:col-span-2">
          <span className="text-xs font-medium text-ink-600">Account search</span>
          <Input name="accountSearch" defaultValue={values.accountSearch} placeholder="Code or account name" />
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
          <span className="text-xs font-medium text-ink-600">From</span>
          <Input name="dateFrom" type="date" defaultValue={values.dateFrom} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">To</span>
          <Input name="dateTo" type="date" defaultValue={values.dateTo} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Fiscal Year</span>
          <Select name="fiscalYearId" defaultValue={values.fiscalYearId ?? ""}>
            <option value="">All fiscal years</option>
            {fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Accounting Period</span>
          <Select name="accountingPeriodId" defaultValue={values.accountingPeriodId ?? ""}>
            <option value="">All periods</option>
            {accountingPeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </Select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm">Apply filters</Button>
        <a href="?" className="text-xs font-medium text-ink-500 hover:text-ink-800">Clear</a>
      </div>
    </form>
  );
}
