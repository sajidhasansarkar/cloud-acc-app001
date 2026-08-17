import { Badge } from "@/components/ui/badge";
import { JOURNAL_ENTRY_STATUS_LABELS } from "@/lib/constants";
import type { JournalEntryStatus } from "@prisma/client";

// Same badge-variant pattern as AccountStatusBadge / fiscal year & period
// status badges elsewhere in the app: a small lookup from the enum value
// to a Badge `variant`, plus the human-readable label from constants.ts.
function statusBadgeVariant(status: JournalEntryStatus) {
  if (status === "POSTED") return "success" as const;
  if (status === "VOID") return "danger" as const;
  return "outline" as const; // DRAFT
}

export function JournalEntryStatusBadge({ status }: { status: JournalEntryStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{JOURNAL_ENTRY_STATUS_LABELS[status]}</Badge>;
}
