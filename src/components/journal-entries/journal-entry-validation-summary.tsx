import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { JournalEntryStatus } from "@prisma/client";
import type { JournalValidationFinding } from "@/accounting/journal-entries";

export function JournalEntryValidationSummary({
  valid, errors, totalDebit, totalCredit, difference, balanced, status, findings = [],
}: {
  valid: boolean;
  errors: string[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  balanced: boolean;
  status: JournalEntryStatus;
  findings?: JournalValidationFinding[];
}) {
  const displayFindings = findings.length
    ? findings
    : errors.map((message) => ({ code: message, severity: "ERROR" as const, message }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Journal Validation</CardTitle>
            <CardDescription>Deterministic debit/credit validation and accounting findings for this Draft Journal Entry.</CardDescription>
          </div>
          <Badge variant={valid ? "success" : "danger"}>{valid ? "READY FOR REVIEW" : "NEEDS REVIEW"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-ink-100 p-3">
            <p className="text-xs text-ink-500">Debit Total</p>
            <p className="font-mono text-sm font-semibold text-ink-900">{totalDebit}</p>
          </div>
          <div className="rounded-md border border-ink-100 p-3">
            <p className="text-xs text-ink-500">Credit Total</p>
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
          {!balanced ? <span className="text-ink-600">Journal is out of balance by {difference.replace("-", "")}.</span> : null}
        </div>

        <div className="rounded-md border border-ink-100">
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="text-sm font-semibold text-ink-900">Findings</p>
          </div>
          {displayFindings.length > 0 ? (
            <div className="divide-y divide-ink-100">
              {displayFindings.map((finding, index) => (
                <div key={`${finding.code}-${finding.lineId ?? ""}-${index}`} className="flex gap-3 px-3 py-2 text-sm">
                  {finding.severity === "ERROR" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" /> : finding.severity === "WARNING" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pending" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />}
                  <div>
                    <p className="font-medium text-ink-900">
                      {finding.severity}{finding.lineNumber ? ` · Line ${finding.lineNumber}` : ""}
                      {finding.field ? ` · ${finding.field}` : ""}
                    </p>
                    <p className="text-ink-600">{finding.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-ink-700">
              <CheckCircle2 className="h-4 w-4 text-positive" />
              No blocking errors found.
            </div>
          )}
        </div>

        <p className="text-xs text-ink-500">
          Persisted lifecycle status: <strong>{status.replaceAll("_", " ")}</strong>. This phase never posts an entry.
        </p>
      </CardContent>
    </Card>
  );
}
