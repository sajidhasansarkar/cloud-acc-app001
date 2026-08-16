import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/session";
import { getOwnedCompany } from "@/accounting/access";

/**
 * Requires a signed-in user with an active organization membership, then
 * verifies companyId belongs to that organization. Never trusts companyId
 * from the browser alone — ownership is re-derived from the session on
 * every call, same rule as the rest of the Phase 2B-1 accounting module.
 * 404s (via notFound()) rather than distinguishing "doesn't exist" from
 * "belongs to another organization".
 */
export async function requireOwnedCompany(companyId: string) {
  const { organization } = await requireActiveOrganization();
  const company = await getOwnedCompany(organization.id, companyId);
  if (!company) {
    notFound();
  }
  return company;
}
