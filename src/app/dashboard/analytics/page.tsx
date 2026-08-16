import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Analytics — Ledger" };

export default async function AnalyticsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Analytics" description="Trends and insights across your companies." />;
}
