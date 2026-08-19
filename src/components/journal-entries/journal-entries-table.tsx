import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JournalEntryStatusBadge } from "@/components/journal-entries/journal-entry-status-badge";
import { JOURNAL_ENTRY_SOURCE_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { JournalEntrySourceType } from "@prisma/client";
import type { JournalEntryListResult } from "@/accounting/journal-entries";

type JournalEntryRow = JournalEntryListResult["entries"][number];

export function JournalEntriesTable({
  companyId,
  entries,
  canManage,
}: {
  companyId: string;
  entries: JournalEntryRow[];
  canManage: boolean;
}) {
  const basePath = `/companies/${companyId}/journal-entries`;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Entry Number</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Label</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reviewer</TableHead>
          <TableHead>Approval</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Created By</TableHead>
          <TableHead>Created Date</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-mono text-xs font-medium text-ink-900">
              <Link href={`${basePath}/${entry.id}`} className="hover:text-ledger-600">
                {entry.entryNumber}
              </Link>
            </TableCell>
            <TableCell className="text-ink-500">{formatDate(entry.entryDate)}</TableCell>
            <TableCell className="text-ink-500">{entry.reference || "—"}</TableCell>
            <TableCell className="max-w-[220px] truncate text-ink-700">
              {entry.description || "—"}
            </TableCell>
            <TableCell className="text-ink-500">{entry.label || "—"}</TableCell>
            <TableCell>
              <JournalEntryStatusBadge status={entry.status} />
            </TableCell>
            <TableCell className="text-ink-500">{entry.reviewedByUser?.name ?? "—"}</TableCell>
            <TableCell className="text-ink-500">{entry.approvedByUser?.name ? `Approved by ${entry.approvedByUser.name}` : "Not approved"}</TableCell>
            <TableCell className="text-ink-500">
              {JOURNAL_ENTRY_SOURCE_TYPE_LABELS[entry.sourceType as JournalEntrySourceType]}
            </TableCell>
            <TableCell className="text-ink-500">{entry.createdBy?.name ?? "—"}</TableCell>
            <TableCell className="text-ink-500">{formatDate(entry.createdAt)}</TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Link
                  href={`${basePath}/${entry.id}`}
                  title="View"
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                >
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">View</span>
                </Link>
                {canManage && entry.status === "DRAFT" ? (
                  <Link
                    href={`${basePath}/${entry.id}/edit`}
                    title="Edit"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Link>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
