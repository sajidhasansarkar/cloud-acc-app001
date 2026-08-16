import type { AccountingPeriod } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { PeriodStatusAction } from "@/components/fiscal-years/period-status-action";

function statusBadgeVariant(status: string) {
  if (status === "OPEN") return "success" as const;
  if (status === "LOCKED") return "danger" as const;
  return "outline" as const; // CLOSED
}

export function PeriodTable({
  companyId,
  periods,
  canManage,
}: {
  companyId: string;
  periods: AccountingPeriod[];
  canManage: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period #</TableHead>
          <TableHead>Period Name</TableHead>
          <TableHead>Start Date</TableHead>
          <TableHead>End Date</TableHead>
          <TableHead>Status</TableHead>
          {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {periods.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-mono text-ink-500">{p.periodNumber}</TableCell>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell className="text-ink-500">{formatDate(p.startDate)}</TableCell>
            <TableCell className="text-ink-500">{formatDate(p.endDate)}</TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
            </TableCell>
            {canManage ? (
              <TableCell className="text-right">
                <PeriodStatusAction
                  companyId={companyId}
                  periodId={p.id}
                  periodName={p.name}
                  status={p.status}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
