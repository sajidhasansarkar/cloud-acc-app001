import { Badge } from "@/components/ui/badge";
import { MAPPING_STATUS_LABELS } from "@/lib/constants";

// AccountMapping.isActive is a plain boolean at the data layer — this is
// the one place that turns it into the ACTIVE / INACTIVE badge, same
// pattern as TaxCodeStatusBadge / AccountStatusBadge.
export function MappingStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "success" : "outline"}>
      {isActive ? MAPPING_STATUS_LABELS.ACTIVE : MAPPING_STATUS_LABELS.INACTIVE}
    </Badge>
  );
}
