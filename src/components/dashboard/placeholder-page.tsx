import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export function PlaceholderPage({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">{title}</h1>
        <p className="text-sm text-ink-500">{description}</p>
      </div>
      <EmptyState
        icon={icon ?? Construction}
        title="Coming in a future phase"
        description={`${title} is part of the Phase 1 navigation shell only. Functionality will be built in a later phase.`}
        className="py-24"
      />
    </div>
  );
}
