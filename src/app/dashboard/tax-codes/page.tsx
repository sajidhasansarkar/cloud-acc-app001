import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { requireActiveOrganization } from "@/lib/session";

export const metadata = { title: "Tax Codes — Ledger" };

export default async function TaxCodesPage() {
  await requireActiveOrganization();
  return <PlaceholderPage title="Tax Codes" description="Manage tax codes used across companies." />;
}
