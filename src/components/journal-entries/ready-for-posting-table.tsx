import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JournalEntryStatusBadge } from "@/components/journal-entries/journal-entry-status-badge";
import { formatDate } from "@/lib/utils";
import type { ReadyForPostingRow } from "@/accounting/journal-entries";

function money(value: string) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
}

export function ReadyForPostingTable({ companyId, entries }: { companyId: string; entries: ReadyForPostingRow[] }) {
  const basePath = `/companies/${companyId}/journal-entries`;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Journal Entry</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Fiscal Year</TableHead>
          <TableHead>Period</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
          <TableHead>Difference</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const stale = entry.readinessErrors.length > 0;
          return (
            <TableRow key={entry.id}>
              <TableCell className="font-mono text-xs font-medium text-ink-900">{entry.entryNumber}</TableCell>
              <TableCell className="text-ink-500">{formatDate(entry.entryDate)}</TableCell>
              <TableCell className="max-w-[220px] truncate text-ink-700">{entry.description || "—"}</TableCell>
              <TableCell className="text-ink-500">{entry.reference || "—"}</TableCell>
              <TableCell className="text-ink-500">{entry.fiscalYearName}</TableCell>
              <TableCell className="text-ink-500">{entry.accountingPeriodName}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(entry.totalDebit)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(entry.totalCredit)}</TableCell>
              <TableCell className={entry.difference === "0.0000" ? "font-mono text-xs text-positive" : "font-mono text-xs text-negative"}>{money(entry.difference)}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <JournalEntryStatusBadge status={entry.status} />
                  {stale ? (
                    <div className="flex max-w-[180px] items-center gap-1 text-[11px] font-medium text-negative" title={entry.readinessErrors.join(" ")}>
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Review Required
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Link href={`${basePath}/${entry.id}`} title="Review" className="inline-flex h-8 items-center gap-1.5 rounded border border-ink-200 px-2.5 text-xs font-medium text-ink-700 hover:bg-surface-muted">
                    <Eye className="h-3.5 w-3.5" />
                    Review
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
