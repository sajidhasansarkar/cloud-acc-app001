import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export type LedgerTableRow = {
  id: string;
  entryDate: Date;
  description: string | null;
  reference: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  account: { id: string; code: string; name: string };
  journalEntry: { id: string; entryNumber: string };
  runningBalance?: Prisma.Decimal;
};

export function GeneralLedgerTable({ companyId, entries, showRunningBalance = false }: { companyId: string; entries: LedgerTableRow[]; showRunningBalance?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Account Code</TableHead>
          <TableHead>Account Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
          {showRunningBalance ? <TableHead className="text-right">Balance</TableHead> : null}
          <TableHead>Journal Entry</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{formatDate(entry.entryDate)}</TableCell>
            <TableCell className="font-mono text-xs">{entry.account.code}</TableCell>
            <TableCell>
              <Link href={`/companies/${companyId}/general-ledger/${entry.account.id}`} className="font-medium hover:text-ledger-600">
                {entry.account.name}
              </Link>
            </TableCell>
            <TableCell className="max-w-[240px] truncate">{entry.description || "—"}</TableCell>
            <TableCell>{entry.reference || "—"}</TableCell>
            <TableCell className="text-right font-mono text-xs">{entry.debit.toFixed(4)}</TableCell>
            <TableCell className="text-right font-mono text-xs">{entry.credit.toFixed(4)}</TableCell>
            {showRunningBalance ? <TableCell className="text-right font-mono text-xs font-medium">{entry.runningBalance?.toFixed(4)}</TableCell> : null}
            <TableCell>
              <Link href={`/companies/${companyId}/journal-entries/${entry.journalEntry.id}`} className="font-mono text-xs font-medium hover:text-ledger-600">
                {entry.journalEntry.entryNumber}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
