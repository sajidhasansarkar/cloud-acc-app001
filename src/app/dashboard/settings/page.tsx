import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Settings — Ledger" };

export default async function SettingsPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Settings" description="Organization and platform preferences." />;
}
