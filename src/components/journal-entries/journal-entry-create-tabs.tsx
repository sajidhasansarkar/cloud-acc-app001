"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export function JournalEntryCreateTabs({
  manual,
  smartImport,
}: {
  manual: ReactNode;
  smartImport: ReactNode;
}) {
  const [tab, setTab] = useState<"manual" | "smart-import">("smart-import");

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-ink-100 bg-surface-subtle p-1">
        <button
          type="button"
          onClick={() => setTab("smart-import")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "smart-import" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Smart Import
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "manual" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
          )}
        >
          <PenLine className="h-3.5 w-3.5" />
          Manual
        </button>
      </div>

      <div className={tab === "smart-import" ? "" : "hidden"}>{smartImport}</div>
      <div className={tab === "manual" ? "" : "hidden"}>{manual}</div>
    </div>
  );
}
