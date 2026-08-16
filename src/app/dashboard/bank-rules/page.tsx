import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Bank Rules — Ledger" };

export default async function BankRulesPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Bank Rules" description="Automation rules for categorizing bank activity." />;
}
