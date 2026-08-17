"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function JournalEntriesError() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-negative/20 bg-negative/5 px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-negative" />
      <div>
        <p className="font-display text-sm font-semibold text-ink-900">Unable to load journal entries</p>
        <p className="mt-1 text-sm text-ink-500">Something went wrong while loading this company&apos;s journal entries. Please try again.</p>
      </div>
      <Button variant="outline" onClick={() => router.refresh()}>Retry</Button>
    </div>
  );
}
