import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Chart of Accounts — Ledger" };

export default async function ChartOfAccountsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Chart of Accounts" description="Manage the account structure for each company." />;
}
