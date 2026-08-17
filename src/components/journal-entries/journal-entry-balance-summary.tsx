"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function JournalEntryBalanceSummary({
  totalDebit,
  totalCredit,
  difference,
  balanced,
  validationMessage,
}: {
  totalDebit: string;
  totalCredit: string;
  difference: string;
  balanced: boolean;
  validationMessage?: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-ink-500">Total Debit</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink-900">{totalDebit}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-ink-500">Total Credit</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink-900">{totalCredit}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-ink-500">Difference</p>
            <p className={cn("mt-1 font-mono text-lg font-semibold", difference === "0.0000" ? "text-positive" : "text-negative")}>
              {difference}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
        balanced ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"
      )}>
        {balanced ? (
          <CheckCircle2 className="h-4 w-4 text-positive" />
        ) : (
          <AlertCircle className="h-4 w-4 text-negative" />
        )}
        <span className="font-medium text-ink-800">Balance Status</span>
        <Badge variant={balanced ? "success" : "danger"}>{balanced ? "BALANCED" : "NOT BALANCED"}</Badge>
        {validationMessage ? <span className="text-ink-600">{validationMessage}</span> : null}
      </div>
    </div>
  );
}
