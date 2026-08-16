import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Bank Reconciliation — Ledger" };

export default async function BankReconciliationPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Bank Reconciliation" description="Match bank feed activity against your books." />;
}
