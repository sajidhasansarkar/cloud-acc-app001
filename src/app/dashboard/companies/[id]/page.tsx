import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Coins, Calendar, Pencil, Mail, Phone, Hash, MapPin, LayoutDashboard } from "lucide-react";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { canManageCompanies } from "@/lib/rbac";
import { COMPANY_STATUS_LABELS } from "@/lib/constants";
import { CompanyStatusAction } from "@/components/companies/company-status-action";

function statusBadgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "ARCHIVED") return "outline" as const;
  return "warning" as const;
}

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const { role, organization } = await requireActiveOrganization();

  const company = await prisma.company.findFirst({
    // Scoping by organizationId here — not just by id — is what enforces
    // tenant isolation: a company from another organization returns null
    // even if the id is guessed correctly.
    where: { id: params.id, organizationId: organization.id },
    include: { countryConfiguration: true },
  });

  if (!company) {
    notFound();
  }

  const canManage = canManageCompanies(role);
  const addressLine = [company.address, company.city, company.stateProvince, company.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/companies"
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to companies
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-ink-900">{company.displayName}</h1>
            <Badge variant={statusBadgeVariant(company.status)}>{COMPANY_STATUS_LABELS[company.status]}</Badge>
          </div>
          <p className="text-sm text-ink-500">{company.legalName}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/companies/${company.id}`} className={buttonVariants({ variant: "primary" })}>
            <LayoutDashboard className="h-4 w-4" />
            Open Workspace
          </Link>
          {canManage ? (
            <>
              <Link
                href={`/dashboard/companies/${company.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <CompanyStatusAction companyId={company.id} companyName={company.displayName} status={company.status} />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Globe className="h-4 w-4 text-ink-400" />
            <div>
              <p className="text-xs text-ink-500">Country</p>
              <p className="text-sm font-medium text-ink-900">
                {company.countryConfiguration?.countryName ?? company.country}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Coins className="h-4 w-4 text-ink-400" />
            <div>
              <p className="text-xs text-ink-500">Currency</p>
              <p className="font-mono text-sm font-medium text-ink-900">
                {company.countryConfiguration?.currencySymbol ?? ""} {company.currency}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Calendar className="h-4 w-4 text-ink-400" />
            <div>
              <p className="text-xs text-ink-500">Created</p>
              <p className="text-sm font-medium text-ink-900">{formatDate(company.createdAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Business information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={Hash} label="Business Number" value={company.businessNumber} />
            <InfoRow icon={MapPin} label="Address" value={addressLine || undefined} />
            <InfoRow icon={Mail} label="Contact Email" value={company.contactEmail} />
            <InfoRow icon={Phone} label="Contact Phone" value={company.contactPhone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={Calendar} label="Created" value={formatDate(company.createdAt)} />
            <InfoRow icon={Calendar} label="Last Updated" value={formatDate(company.updatedAt)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Books</CardTitle>
          <CardDescription>
            Transactions, journal entries, and the general ledger for this company arrive in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-500">
            This company record is ready. Bookkeeping modules will connect to it once built.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div>
        <p className="text-xs text-ink-500">{label}</p>
        <p className="text-sm font-medium text-ink-900">{value || "—"}</p>
      </div>
    </div>
  );
}
