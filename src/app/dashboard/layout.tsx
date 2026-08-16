import { requireActiveOrganization } from "@/lib/session";
import { getCompanySwitcherList } from "@/lib/company-switcher";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, organization } = await requireActiveOrganization();

  const companies = await getCompanySwitcherList(organization.id);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          orgName={organization.name}
          companies={companies}
          user={{ name: user.name ?? "", email: user.email ?? "", role: role }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
