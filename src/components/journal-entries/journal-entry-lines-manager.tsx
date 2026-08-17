"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { reorderJournalEntryLineAction } from "@/actions/journal-entries";
import type { JournalEntryStatus } from "@prisma/client";

type Line = {
  id: string;
  description: string | null;
  reference: string | null;
  debit: string;
  credit: string;
  account: { code: string; name: string };
};

export function JournalEntryLinesManager({
  companyId,
  journalEntryId,
  status,
  lines,
}: {
  companyId: string;
  journalEntryId: string;
  status: JournalEntryStatus;
  lines: Line[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const editable = status === "DRAFT";

  function move(lineId: string, direction: "UP" | "DOWN") {
    startTransition(async () => {
      const result = await reorderJournalEntryLineAction(companyId, journalEntryId, lineId, direction);
      if (result.ok) {
        toast("Journal line order updated.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <div className="rounded-lg border border-ink-100">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Debit</TableHead>
            <TableHead className="text-right">Credit</TableHead>
            <TableHead className="w-24 text-right">Order</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow key={line.id}>
              <TableCell className="text-ink-500">{index + 1}</TableCell>
              <TableCell className="text-ink-800">
                <span className="font-mono text-xs text-ink-500">{line.account.code}</span>{" — "}{line.account.name}
              </TableCell>
              <TableCell className="text-ink-700">{line.description || "—"}</TableCell>
              <TableCell className="text-ink-700">{line.reference || "—"}</TableCell>
              <TableCell className="text-right font-mono text-ink-800">{line.debit}</TableCell>
              <TableCell className="text-right font-mono text-ink-800">{line.credit}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={index === 0 ? "Already first" : "Move up"}
                    aria-label={`Move line ${index + 1} up`}
                    onClick={() => move(line.id, "UP")}
                    disabled={!editable || index === 0 || isPending}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title={index === lines.length - 1 ? "Already last" : "Move down"}
                    aria-label={`Move line ${index + 1} down`}
                    onClick={() => move(line.id, "DOWN")}
                    disabled={!editable || index === lines.length - 1 || isPending}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

