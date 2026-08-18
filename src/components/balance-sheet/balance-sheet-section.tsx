import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  account: { id: string; code: string; name: string; subtype: string | null };
  balance: Prisma.Decimal;
};

export function BalanceSheetSection({ companyId, title, rows, total, asOfDate }: { companyId: string; title: string; rows: Row[]; total: Prisma.Decimal; asOfDate: string }) {
  const grouped = rows.reduce<Record<string, Row[]>>((acc, row) => {
    const key = row.account.subtype?.trim() || "Other";
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  return (
    <section className="border-b border-ink-100 last:border-b-0">
      <div className="border-b border-ink-100 bg-surface-muted px-4 py-3">
        <h2 className="font-display text-sm font-semibold tracking-wide text-ink-900">{title}</h2>
      </div>
      {Object.keys(grouped).sort().map((groupName) => (
        <div key={groupName}>
          {Object.keys(grouped).length > 1 && (
            <div className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{groupName}</div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped[groupName].map((row) => (
                <TableRow key={row.account.id}>
                  <TableCell>
                    <Link href={`/companies/${companyId}/general-ledger/${row.account.id}?dateTo=${asOfDate}`} className="font-mono text-xs font-medium hover:text-ledger-600">
                      {row.account.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/companies/${companyId}/general-ledger/${row.account.id}?dateTo=${asOfDate}`} className="font-medium hover:text-ledger-600">
                      {row.account.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{row.balance.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
      <div className="flex items-center justify-between bg-surface-muted px-4 py-3 text-sm font-semibold">
        <span>Total {title[0] + title.slice(1).toLowerCase()}</span>
        <span className="font-mono">{total.toFixed(4)}</span>
      </div>
    </section>
  );
}
