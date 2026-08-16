import { Bot } from "lucide-react";
import { requireOwnedCompany } from "@/lib/company-guard";
import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

// Placeholder route -- Phase 2B-2A. AI Assistant functionality is out of scope for
// this phase; this route exists only so the company workspace navigation has
// somewhere real to point to. No accounting data is read or displayed here.
export default async function CompanyAIAssistantPage({
  params,
}: {
  params: { companyId: string };
}) {
  await requireOwnedCompany(params.companyId);

  return (
    <PlaceholderPage
      title="AI Assistant"
      description="The AI accounting assistant for this company."
      icon={Bot}
    />
  );
}
