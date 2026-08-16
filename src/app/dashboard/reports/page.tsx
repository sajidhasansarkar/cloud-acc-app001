import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Reports — Ledger" };

export default async function ReportsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Reports" description="Financial statements and custom reports." />;
}
