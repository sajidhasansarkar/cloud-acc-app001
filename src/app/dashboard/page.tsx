import Link from "next/link";
import { Building2, CheckCircle2, Clock, ArrowLeftRight, Plus, FolderOpen, Upload, Building } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dashboard — Ledger" };

export default async function DashboardPage() {
  const { organization } = await requireActiveOrganization();

  const [totalCompanies, activeCompanies, recentCompanies] = await Promise.all([
    prisma.company.count({ where: { organizationId: organization.id } }),
    prisma.company.count({ where: { organizationId: organization.id, status: "ACTIVE" } }),
    prisma.company.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-500">Overview for {organization.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Companies" value={totalCompanies} icon={Building2} />
        <StatCard label="Active Companies" value={activeCompanies} icon={CheckCircle2} />
        <StatCard
          label="Pending Reviews"
          value="—"
          icon={Clock}
          hint="Available once Journal Entries ships"
          muted
        />
        <StatCard
          label="Recent Transactions"
          value="—"
          icon={ArrowLeftRight}
          hint="Available once Transactions ships"
          muted
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent Companies</CardTitle>
              <CardDescription>The last companies added to your organization</CardDescription>
            </div>
            <Link href="/dashboard/companies" className={buttonVariants({ variant: "outline", size: "sm" })}>
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentCompanies.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Building}
                  title="No companies yet"
                  description="Create your first company to start organizing client books."
                  action={
                    <Link
                      href="/dashboard/companies/new"
                      className={buttonVariants({ variant: "primary", size: "sm" })}
                    >
                      <Plus className="h-4 w-4" />
                      Create company
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentCompanies.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/companies/${c.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">{c.displayName}</p>
                        <p className="truncate text-xs text-ink-500">
                          {c.legalName} · {c.country} · {c.currency}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant={c.status === "ACTIVE" ? "success" : "outline"}>{c.status}</Badge>
                        <span className="text-xs text-ink-400">{formatDate(c.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link
                href="/dashboard/companies/new"
                className={buttonVariants({ variant: "primary", className: "justify-start" })}
              >
                <Plus className="h-4 w-4" />
                Create Company
              </Link>
              <Link
                href="/dashboard/companies"
                className={buttonVariants({ variant: "outline", className: "justify-start" })}
              >
                <FolderOpen className="h-4 w-4" />
                Open Company
              </Link>
              <span
                className={buttonVariants({
                  variant: "outline",
                  className: "cursor-not-allowed justify-start opacity-50",
                })}
                title="Coming in a future phase"
              >
                <Upload className="h-4 w-4" />
                Import Statement
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Audit trail arrives in a later phase</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink-500">
                Activity logging will appear here once the Audit Logs module is built.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
