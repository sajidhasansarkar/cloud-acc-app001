import { redirect } from "next/navigation";
import { requireOwnedCompany } from "@/lib/company-guard";

export default async function CompanyReportsPage({ params }: { params: { companyId: string } }) {
  await requireOwnedCompany(params.companyId);
  redirect(`/companies/${params.companyId}/trial-balance`);
}
