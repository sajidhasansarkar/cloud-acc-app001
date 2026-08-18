import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { JournalEntryStatus } from "@prisma/client";

export function JournalEntryValidationSummary({
  valid, errors, totalDebit, totalCredit, difference, balanced, status,
}: {
  valid: boolean;
  errors: string[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  balanced: boolean;
  status: JournalEntryStatus;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Accounting Review</CardTitle>
            <CardDescription>Validation must pass before the journal entry can enter review or become Ready for Posting.</CardDescription>
          </div>
          <Badge variant={valid ? "success" : "danger"}>{valid ? "VALID" : "REVIEW REQUIRED"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-ink-100 p-3">
            <p className="text-xs text-ink-500">Total Debit</p>
            <p className="font-mono text-sm font-semibold text-ink-900">{totalDebit}</p>
          </div>
          <div className="rounded-md border border-ink-100 p-3">
            <p className="text-xs text-ink-500">Total Credit</p>
            <p className="font-mono text-sm font-semibold text-ink-900">{totalCredit}</p>
          </div>
          <div className="rounded-md border border-ink-100 p-3">
            <p className="text-xs text-ink-500">Difference</p>
            <p className="font-mono text-sm font-semibold text-ink-900">{difference}</p>
          </div>
        </div>

        <div className={balanced ? "flex items-center gap-2 rounded-md border border-positive/20 bg-positive/5 px-3 py-2 text-sm text-ink-800" : "flex items-center gap-2 rounded-md border border-negative/20 bg-negative/5 px-3 py-2 text-sm text-ink-800"}>
          {balanced ? <CheckCircle2 className="h-4 w-4 text-positive" /> : <AlertTriangle className="h-4 w-4 text-negative" />}
          <span>Balance Status: <strong>{balanced ? "BALANCED" : "NOT BALANCED"}</strong></span>
        </div>

        {errors.length > 0 ? (
          <div className="rounded-md border border-negative/20 bg-negative/5 p-3">
            <p className="mb-2 text-sm font-semibold text-ink-900">Validation Errors</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
              {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-positive/20 bg-positive/5 px-3 py-2 text-sm text-ink-800">
            All required accounting validation rules pass. Current status: <strong>{status.replaceAll("_", " ")}</strong>.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
