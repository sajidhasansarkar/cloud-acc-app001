import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/rbac";

const ACTIVE_ORG_COOKIE = "activeOrgId";

/**
 * Returns the current session, or null if not signed in.
 * Use this in server components / route handlers — never trust the client.
 */
export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/**
 * Requires a signed-in user. Redirects to /login otherwise.
 * Call this at the top of any protected server component or server action.
 */
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Resolves the "active organization" for the current user.
 *
 * This is the core of data isolation: every query for Companies (and, in
 * later phases, every accounting record) must be scoped to this
 * organizationId. A user only ever sees data belonging to organizations they
 * have an ACTIVE membership in.
 *
 * Selection strategy for Phase 1:
 *  - If an `activeOrgId` cookie is set AND the user has an active membership
 *    in that org, use it.
 *  - Otherwise, fall back to the user's first active membership.
 *  - If the user has no memberships at all, redirect to a "no access" state.
 */
export async function requireActiveOrganization() {
  const user = await requireUser();

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    redirect("/no-access");
  }

  const cookieStore = cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const active =
    memberships.find((m) => m.organizationId === requestedOrgId) ?? memberships[0];

  return {
    user,
    role: active.role as Role,
    organization: active.organization,
    memberships,
  };
}

export { ACTIVE_ORG_COOKIE };
