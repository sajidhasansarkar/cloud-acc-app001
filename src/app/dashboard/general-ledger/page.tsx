import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "General Ledger — Ledger" };

export default async function GeneralLedgerPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="General Ledger" description="The full ledger of posted activity." />;
}
