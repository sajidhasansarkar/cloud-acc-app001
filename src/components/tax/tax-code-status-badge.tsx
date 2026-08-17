import { Badge } from "@/components/ui/badge";
import { TAX_CODE_STATUS_LABELS } from "@/lib/constants";

// TaxCode.isActive is a plain boolean at the data layer — this is the one
// place that turns it into the ACTIVE / INACTIVE badge, same pattern as
// AccountStatusBadge.
export function TaxCodeStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "success" : "outline"}>
      {isActive ? TAX_CODE_STATUS_LABELS.ACTIVE : TAX_CODE_STATUS_LABELS.INACTIVE}
    </Badge>
  );
}
