import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  account: { id: string; code: string; name: string; subtype: string | null };
  balance: Prisma.Decimal;
};

function formatMoney(value: Prisma.Decimal, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}

function groupLabel(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) return "Other";
  return normalized;
}

export function BalanceSheetSection({
  companyId,
  title,
  rows,
  total,
  asOfDate,
  currency,
}: {
  companyId: string;
  title: string;
  rows: Row[];
  total: Prisma.Decimal;
  asOfDate: string;
  currency: string;
}) {
  const grouped = rows.reduce<Record<string, Row[]>>((acc, row) => {
    const key = groupLabel(row.account.subtype);
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const showGroupLabels = groupNames.length > 1;

  return (
    <section className="border-b border-ink-100 last:border-b-0">
      <div className="flex items-center justify-between border-b border-ink-100 bg-surface-muted px-4 py-3">
        <h2 className="font-display text-sm font-semibold tracking-wide text-ink-900">{title}</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{rows.length} accounts</span>
      </div>

      {groupNames.length === 0 ? (
        <div className="px-4 py-6 text-sm text-ink-500">No accounts with posted activity in this section.</div>
      ) : (
        groupNames.map((groupName) => (
          <div key={groupName}>
            {showGroupLabels ? (
              <div className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{groupName}</div>
            ) : null}
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="w-48 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped[groupName].map((row) => {
                    const href = `/companies/${companyId}/general-ledger/${row.account.id}?dateTo=${encodeURIComponent(asOfDate)}`;
                    return (
                      <TableRow key={row.account.id}>
                        <TableCell>
                          <Link href={href} className="font-mono text-xs font-medium text-ink-700 hover:text-ledger-600">
                            {row.account.code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={href} className="font-medium text-ink-800 hover:text-ledger-600">
                            {row.account.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                          {formatMoney(row.balance, currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))
      )}

      <div className="flex items-center justify-between bg-surface-muted px-4 py-3 text-sm font-semibold">
        <span>Total {title[0] + title.slice(1).toLowerCase()}</span>
        <span className="font-mono tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </section>
  );
}
