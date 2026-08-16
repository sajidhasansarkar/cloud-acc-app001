import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Import Center — Ledger" };

export default async function ImportCenterPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Import Center" description="Import bank statements and source documents." />;
}
