import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Export Data — Ledger" };

export default async function ExportDataPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Export Data" description="Export ledgers and reports." />;
}
