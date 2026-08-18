import type { FiscalYear } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function BalanceSheetFilterBar({
  accounts,
  fiscalYears,
  values,
}: {
  accounts: { id: string; code: string; name: string }[];
  fiscalYears: Pick<FiscalYear, "id" | "name" | "startDate" | "endDate">[];
  values: { asOfDate: string; fiscalYearId?: string; accountId?: string; accountSearch?: string };
}) {
  return (
    <form method="get" className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">As of Date</span>
          <Input name="asOfDate" type="date" required defaultValue={values.asOfDate} />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Fiscal Year</span>
          <Select name="fiscalYearId" defaultValue={values.fiscalYearId ?? ""}>
            <option value="">All fiscal years</option>
            {fiscalYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Account</span>
          <Select name="accountId" defaultValue={values.accountId ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-ink-600">Account search</span>
          <Input name="accountSearch" defaultValue={values.accountSearch} placeholder="Code or account name" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm">Apply filters</Button>
        <a href="?" className="text-xs font-medium text-ink-500 hover:text-ink-800">Clear</a>
      </div>
    </form>
  );
}
