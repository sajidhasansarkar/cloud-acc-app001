import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Fiscal Period — Ledger" };

export default async function FiscalPeriodPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Fiscal Period" description="Configure fiscal years and closing periods." />;
}
