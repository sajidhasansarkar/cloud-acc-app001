import { Badge } from "@/components/ui/badge";
import { ACCOUNT_STATUS_LABELS } from "@/lib/constants";

// Account.isActive is a plain boolean at the data layer — this is the one
// place that turns it into the ACTIVE / INACTIVE badge the spec asks for.
export function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "success" : "outline"}>
      {isActive ? ACCOUNT_STATUS_LABELS.ACTIVE : ACCOUNT_STATUS_LABELS.INACTIVE}
    </Badge>
  );
}
