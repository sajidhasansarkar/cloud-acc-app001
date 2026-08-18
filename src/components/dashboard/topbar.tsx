import { UserMenu } from "@/components/dashboard/user-menu";
import { ReportsDropdown } from "@/components/companies/reports-dropdown";
import { CompanySelector, type CompanySelectorItem } from "@/components/companies/company-selector";
import type { Role } from "@/lib/rbac";

export function Topbar({
  orgName,
  companies,
  activeCompanyId,
  companySwitcherBasePath,
  user,
}: {
  orgName: string;
  companies: CompanySelectorItem[];
  activeCompanyId?: string;
  // Forwarded to CompanySelector — see its doc comment. Defaults to the
  // Phase 2A company management route when omitted.
  companySwitcherBasePath?: string;
  user: { name: string; email: string; role: Role };
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-100 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-ink-500 sm:block">{orgName}</span>
        <span className="hidden h-4 w-px bg-ink-200 sm:block" />
        <CompanySelector
          companies={companies}
          activeCompanyId={activeCompanyId}
          basePath={companySwitcherBasePath}
        />
        {activeCompanyId && <ReportsDropdown companyId={activeCompanyId} className="lg:hidden w-44" />}
      </div>
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  );
}
