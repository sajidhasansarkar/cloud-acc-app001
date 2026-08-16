"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  createCompanySchema,
  updateCompanySchema,
  updateAccountingSettingsSchema,
  type CompanyFieldErrors,
} from "@/lib/validations";
import { canManageCompanies } from "@/lib/rbac";

export type CompanyFormState = {
  error?: string;
  fieldErrors?: CompanyFieldErrors;
  // Set to a fresh timestamp on a successful *non-redirecting* update (see
  // updateCompanySettingsAction below). updateCompanyAction never sets this
  // — it redirects on success instead, so the component never re-renders
  // with a "success" state. Consumers (e.g. CompanyForm) can watch this
  // value to show a one-off success toast without stomping on ordinary
  // edits.
  success?: number;
};

function readCompanyFormData(formData: FormData) {
  return {
    legalName: String(formData.get("legalName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    businessNumber: String(formData.get("businessNumber") ?? ""),
    address: String(formData.get("address") ?? ""),
    city: String(formData.get("city") ?? ""),
    stateProvince: String(formData.get("stateProvince") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    country: String(formData.get("country") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
  };
}

function toFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: CompanyFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof CompanyFieldErrors;
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// Looks up the CountryConfiguration for a given ISO country code. Never
// trusts a client-supplied id — always re-derives it server-side from the
// validated country code so a tampered form can't attach a company to an
// arbitrary configuration row.
async function resolveCountryConfiguration(countryCode: string) {
  return prisma.countryConfiguration.findUnique({ where: { countryCode } });
}

export async function createCompanyAction(
  _prevState: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageCompanies(role)) {
    return { error: "You don't have permission to create companies." };
  }

  const parsed = createCompanySchema.safeParse(readCompanyFormData(formData));
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const countryConfiguration = await resolveCountryConfiguration(parsed.data.country);
  if (!countryConfiguration) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: { country: "Unknown country" },
    };
  }

  const company = await prisma.company.create({
    data: {
      organizationId: organization.id, // server-derived, never trust a client-sent orgId
      legalName: parsed.data.legalName,
      displayName: parsed.data.displayName,
      businessNumber: parsed.data.businessNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      stateProvince: parsed.data.stateProvince,
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
      countryConfigurationId: countryConfiguration.id,
      currency: parsed.data.currency,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
      status: parsed.data.status,
    },
  });

  revalidatePath("/dashboard/companies");
  revalidatePath("/dashboard");
  redirect(`/dashboard/companies/${company.id}`);
}

export type ApplyCompanyUpdateResult =
  | { ok: true; companyId: string }
  | { ok: false; state: CompanyFormState };

// Shared by updateCompanyAction (dashboard "Edit Company" page — redirects
// on success) and updateCompanySettingsAction (Company Settings → General
// tab — stays on the page and toasts instead). Both need the exact same
// validation, ownership check, and write; keeping that logic in one place
// means the two entry points can never drift apart on what counts as a
// valid update.
async function applyCompanyUpdate(companyId: string, formData: FormData): Promise<ApplyCompanyUpdateResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageCompanies(role)) {
    return { ok: false, state: { error: "You don't have permission to edit companies." } };
  }

  // Ownership check: the company must belong to the caller's organization.
  // A companyId alone is never sufficient — this is what prevents a user in
  // Organization A from editing a company that belongs to Organization B.
  const existing = await prisma.company.findFirst({
    where: { id: companyId, organizationId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, state: { error: "Company not found." } };
  }

  const parsed = updateCompanySchema.safeParse(readCompanyFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      state: { error: "Please fix the errors below.", fieldErrors: toFieldErrors(parsed.error.issues) },
    };
  }

  const countryConfiguration = await resolveCountryConfiguration(parsed.data.country);
  if (!countryConfiguration) {
    return {
      ok: false,
      state: { error: "Please fix the errors below.", fieldErrors: { country: "Unknown country" } },
    };
  }

  await prisma.company.update({
    where: { id: existing.id }, // safe: existence + org ownership already verified above
    data: {
      legalName: parsed.data.legalName,
      displayName: parsed.data.displayName,
      businessNumber: parsed.data.businessNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      stateProvince: parsed.data.stateProvince,
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
      countryConfigurationId: countryConfiguration.id,
      currency: parsed.data.currency,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
      status: parsed.data.status,
    },
  });

  return { ok: true, companyId: existing.id };
}

export async function updateCompanyAction(
  companyId: string,
  _prevState: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const result = await applyCompanyUpdate(companyId, formData);
  if (!result.ok) {
    return result.state;
  }

  revalidatePath("/dashboard/companies");
  revalidatePath(`/dashboard/companies/${result.companyId}`);
  revalidatePath("/dashboard");
  redirect(`/dashboard/companies/${result.companyId}`);
}

// Same validation/write as updateCompanyAction, used by the Company
// Settings → General tab. Deliberately does NOT redirect: Settings is a
// stay-on-the-page-and-toast surface (see CompanyForm's `variant="settings"`
// and useToast), unlike the dashboard's dedicated Edit Company page.
export async function updateCompanySettingsAction(
  companyId: string,
  _prevState: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const result = await applyCompanyUpdate(companyId, formData);
  if (!result.ok) {
    return result.state;
  }

  revalidatePath(`/companies/${result.companyId}/settings/general`);
  revalidatePath(`/companies/${result.companyId}`);
  revalidatePath("/dashboard/companies");

  return { success: Date.now() };
}

export type SetCompanyStatusResult = { ok: true } | { ok: false; error: string };

// Shared by the Archive and Restore actions in the UI — both just move a
// company between ACTIVE and ARCHIVED. Companies are never deleted, only
// their status changes, so historical records always remain in the database.
export async function setCompanyStatusAction(
  companyId: string,
  status: "ACTIVE" | "ARCHIVED"
): Promise<SetCompanyStatusResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageCompanies(role)) {
    return { ok: false, error: "You don't have permission to update companies." };
  }

  // Same org-ownership rule as update: verify before writing, never trust
  // the companyId supplied by the client.
  const existing = await prisma.company.findFirst({
    where: { id: companyId, organizationId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Company not found." };
  }

  await prisma.company.update({
    where: { id: existing.id },
    data: { status },
  });

  revalidatePath("/dashboard/companies");
  revalidatePath(`/dashboard/companies/${existing.id}`);
  revalidatePath("/dashboard");

  return { ok: true };
}

// ------------------------------
// Company Settings — Accounting tab (Phase 2B-2B-2)
// ------------------------------

export type AccountingSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

// Persists the company's default accounting-period frequency. This is only
// ever a *default* that pre-fills the frequency selector in the existing
// "Generate Periods" dialog (Phase 2B-1) — it never generates, edits, or
// deletes any FiscalYear / AccountingPeriod row itself, so it can't
// duplicate or bypass that module's own ownership checks or its
// once-per-fiscal-year guard.
export async function updateAccountingSettingsAction(
  companyId: string,
  frequency: "MONTHLY" | "QUARTERLY"
): Promise<AccountingSettingsResult> {
  const { role, organization } = await requireActiveOrganization();

  if (!canManageCompanies(role)) {
    return { ok: false, error: "You don't have permission to update company settings." };
  }

  const parsed = updateAccountingSettingsSchema.safeParse({
    companyId,
    defaultPeriodFrequency: frequency,
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid frequency." };
  }

  // Ownership check: same Authenticated User -> Organization -> Company
  // rule as every other write in this file. companyId is never trusted on
  // its own.
  const existing = await prisma.company.findFirst({
    where: { id: parsed.data.companyId, organizationId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Company not found." };
  }

  await prisma.company.update({
    where: { id: existing.id },
    data: { defaultPeriodFrequency: parsed.data.defaultPeriodFrequency },
  });

  revalidatePath(`/companies/${existing.id}/settings/accounting`);
  revalidatePath(`/companies/${existing.id}/settings/fiscal-period`);

  return { ok: true };
}
