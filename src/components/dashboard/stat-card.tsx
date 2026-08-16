import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  muted,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <Icon className="h-4 w-4 text-ink-300" />
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular-nums",
          muted ? "text-ink-400" : "text-ink-900"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
