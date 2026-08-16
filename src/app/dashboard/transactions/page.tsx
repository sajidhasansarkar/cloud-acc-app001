import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Transactions — Ledger" };

export default async function TransactionsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Transactions" description="Record and review incoming and outgoing transactions." />;
}
