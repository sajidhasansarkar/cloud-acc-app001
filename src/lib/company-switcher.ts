import { prisma } from "@/lib/prisma";

/**
 * Companies available to the Company Switcher (Topbar / CompanySelector),
 * scoped to the caller's organization. Shared by the Phase 2A dashboard
 * layout and the Phase 2B-2A company workspace layout so both switchers
 * stay in sync with a single query.
 */
export async function getCompanySwitcherList(organizationId: string) {
  return prisma.company.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, displayName: true, status: true },
    take: 20,
  });
}
