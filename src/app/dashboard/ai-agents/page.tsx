import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "AI Agents — Ledger" };

export default async function AiAgentsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="AI Agents" description="Automated bookkeeping agents (not yet implemented)." />;
}
