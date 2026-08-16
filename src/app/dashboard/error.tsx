"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-negative/20 bg-negative/5 px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-negative" />
      <div>
        <p className="font-display text-sm font-semibold text-ink-900">Something went wrong</p>
        <p className="mt-1 text-sm text-ink-500">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
