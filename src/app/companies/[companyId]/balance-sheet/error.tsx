"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BalanceSheetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-600" />
        <h2 className="mt-3 font-display text-base font-semibold text-ink-900">Unable to load Balance Sheet</h2>
        <p className="mt-1 text-sm text-ink-600">The report could not be loaded. Please try again.</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
