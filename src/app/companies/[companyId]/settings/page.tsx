import { redirect } from "next/navigation";

// /companies/[companyId]/settings has no content of its own — General is
// the default tab. requireOwnedCompany (Authenticated User -> Organization
// -> Company) still runs on the destination page itself, so this redirect
// carries no security weight of its own; it's just a landing-spot alias.
export default function CompanySettingsIndexPage({
  params,
}: {
  params: { companyId: string };
}) {
  redirect(`/companies/${params.companyId}/settings/general`);
}
