import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Integrations — Ledger" };

export default async function IntegrationsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Integrations" description="Connect external systems and data sources." />;
}
