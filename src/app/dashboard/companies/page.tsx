import Link from "next/link";
import { Suspense } from "react";
import { Plus, Building, Eye, Pencil, LayoutDashboard } from "lucide-react";
import type { Prisma, CompanyStatus } from "@prisma/client";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { canManageCompanies } from "@/lib/rbac";
import { CompaniesFilterBar } from "@/components/companies/companies-filter-bar";
import { CompanyStatusAction } from "@/components/companies/company-status-action";
import { ALL_COMPANY_STATUSES, COMPANY_STATUS_LABELS, INITIAL_COUNTRIES } from "@/lib/constants";

export const metadata = { title: "Companies — Ledger" };

const SORT_MAP: Record<string, Prisma.CompanyOrderByWithRelationInput> = {
  createdAt_desc: { createdAt: "desc" },
  createdAt_asc: { createdAt: "asc" },
  updatedAt_desc: { updatedAt: "desc" },
  legalName_asc: { legalName: "asc" },
  legalName_desc: { legalName: "desc" },
  displayName_asc: { displayName: "asc" },
  displayName_desc: { displayName: "desc" },
};

function statusBadgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "ARCHIVED") return "outline" as const;
  return "warning" as const;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; country?: string; status?: string; sort?: string };
}) {
  const { role, organization } = await requireActiveOrganization();

  const q = searchParams.q?.trim();
  const country = searchParams.country?.trim();
  const rawStatus = searchParams.status?.trim();
  const status = rawStatus && (ALL_COMPANY_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as CompanyStatus)
    : undefined;
  const sortKey = searchParams.sort && SORT_MAP[searchParams.sort] ? searchParams.sort : "createdAt_desc";

  // organizationId scoping here is what enforces tenant isolation for the
  // whole list — every other filter is layered on top of it, never instead
  // of it, so a crafted query string can never surface another org's data.
  const where: Prisma.CompanyWhereInput = {
    organizationId: organization.id,
    ...(country ? { country } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { legalName: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            { businessNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [companies, dbCountries, totalCount] = await Promise.all([
    prisma.company.findMany({ where, orderBy: SORT_MAP[sortKey] }),
    prisma.countryConfiguration.findMany({
      where: { isActive: true },
      orderBy: { countryName: "asc" },
      select: { countryCode: true, countryName: true },
    }),
    prisma.company.count({ where: { organizationId: organization.id } }),
  ]);

  const countries = dbCountries.length > 0 ? dbCountries : [...INITIAL_COUNTRIES];
  const statusOptions = ALL_COMPANY_STATUSES.map((s) => ({ value: s, label: COMPANY_STATUS_LABELS[s] }));
  const isFiltered = Boolean(q || country || status);
  const canManage = canManageCompanies(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Companies</h1>
          <p className="text-sm text-ink-500">
            {totalCount} {totalCount === 1 ? "company" : "companies"} in {organization.name}
          </p>
        </div>
        {canManage ? (
          <Link href="/dashboard/companies/new" className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" />
            Create Company
          </Link>
        ) : null}
      </div>

      <div className="rounded-lg border border-ink-100 bg-white shadow-card">
        <Suspense fallback={<div className="h-[76px] border-b border-ink-100" />}>
          <CompaniesFilterBar countries={countries} statuses={statusOptions} />
        </Suspense>

        {companies.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Building}
              title={isFiltered ? "No matching companies" : "No companies yet"}
              description={
                isFiltered
                  ? "Try a different search term or clear your filters."
                  : "Create your first company to start organizing client books."
              }
              action={
                !isFiltered && canManage ? (
                  <Link
                    href="/dashboard/companies/new"
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    <Plus className="h-4 w-4" />
                    Create company
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Legal Business Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/companies/${c.id}`} className="hover:text-ledger-600">
                      {c.legalName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-500">{c.displayName}</TableCell>
                  <TableCell>{c.country}</TableCell>
                  <TableCell className="font-mono">{c.currency}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(c.status)}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-ink-500">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-ink-500">{formatDate(c.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/companies/${c.id}`}
                        title="Open workspace"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        <span className="sr-only">Open workspace</span>
                      </Link>
                      <Link
                        href={`/dashboard/companies/${c.id}`}
                        title="View"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View</span>
                      </Link>
                      {canManage ? (
                        <>
                          <Link
                            href={`/dashboard/companies/${c.id}/edit`}
                            title="Edit"
                            className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Link>
                          <CompanyStatusAction
                            variant="icon"
                            companyId={c.id}
                            companyName={c.displayName}
                            status={c.status}
                          />
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
