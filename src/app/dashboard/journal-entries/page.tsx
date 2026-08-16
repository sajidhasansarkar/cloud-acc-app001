import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Journal Entries — Ledger" };

export default async function JournalEntriesPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Journal Entries" description="Manual and system-generated journal entries." />;
}
