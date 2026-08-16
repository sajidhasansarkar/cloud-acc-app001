import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-200 bg-surface-muted px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card">
        <Icon className="h-5 w-5 text-ink-400" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-sm font-semibold text-ink-900">{title}</p>
        {description ? <p className="text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
