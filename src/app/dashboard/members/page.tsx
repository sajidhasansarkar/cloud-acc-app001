import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Members — Ledger" };

export default async function MembersPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Members" description="Manage who has access to this organization." />;
}
