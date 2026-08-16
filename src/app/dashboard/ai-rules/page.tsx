import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "AI Rules — Ledger" };

export default async function AiRulesPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="AI Rules" description="Rules that govern AI-assisted categorization." />;
}
