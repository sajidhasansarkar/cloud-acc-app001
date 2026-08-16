import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Trial Balance — Ledger" };

export default async function TrialBalancePage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Trial Balance" description="Verify debits and credits are in balance." />;
}
