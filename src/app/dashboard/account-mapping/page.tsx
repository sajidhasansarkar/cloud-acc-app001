import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Account Mapping — Ledger" };

export default async function AccountMappingPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Account Mapping" description="Map imported data to chart of accounts." />;
}
