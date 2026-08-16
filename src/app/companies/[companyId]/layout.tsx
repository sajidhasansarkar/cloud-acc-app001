import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";
import { getCompanySwitcherList } from "@/lib/company-switcher";
import { CompanySidebar } from "@/components/companies/company-sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function CompanyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  const { user, role, organization } = await requireActiveOrganization();

  // Security gate for the entire company workspace: Authenticated User ->
  // Organization Membership (requireActiveOrganization above) -> Company
  // belongs to Organization (getOwnedCompany here). companyId comes straight
  // from the URL and is never trusted on its own — getOwnedCompany re-derives
  // ownership from organization.id every time. A company that doesn't exist
  // and a company that belongs to a different organization both resolve to
  // the same "not found" outcome below, so neither case leaks whether the id
  // exists elsewhere.
  const company = await getOwnedCompany(organization.id, params.companyId);
  if (!company) {
    notFound();
  }

  const companies = await getCompanySwitcherList(organization.id);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <CompanySidebar companyId={company.id} companyName={company.displayName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          orgName={organization.name}
          companies={companies}
          activeCompanyId={company.id}
          companySwitcherBasePath="/companies"
          user={{ name: user.name ?? "", email: user.email ?? "", role }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
