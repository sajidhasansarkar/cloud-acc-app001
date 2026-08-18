import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

type Row = {
  account: { id: string; code: string; name: string };
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  balance: Prisma.Decimal;
};

export function TrialBalanceTable({ companyId, rows }: { companyId: string; rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account Code</TableHead>
          <TableHead>Account Name</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.account.id}>
            <TableCell>
              <Link href={`/companies/${companyId}/general-ledger/${row.account.id}`} className="font-mono text-xs font-medium hover:text-ledger-600">
                {row.account.code}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/companies/${companyId}/general-ledger/${row.account.id}`} className="font-medium hover:text-ledger-600">
                {row.account.name}
              </Link>
            </TableCell>
            <TableCell className="text-right font-mono text-xs">{row.debit.toFixed(4)}</TableCell>
            <TableCell className="text-right font-mono text-xs">{row.credit.toFixed(4)}</TableCell>
            <TableCell className="text-right font-mono text-xs font-medium">{row.balance.toFixed(4)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
