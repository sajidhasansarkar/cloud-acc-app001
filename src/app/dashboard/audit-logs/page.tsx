import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Audit Logs — Ledger" };

export default async function AuditLogsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Audit Logs" description="A history of changes made across the platform." />;
}
