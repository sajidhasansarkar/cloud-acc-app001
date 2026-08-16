/**
 * Role structure — Phase 1.
 *
 * Roles exist at two levels:
 *  - User.role: the user's default/global role (used for brand-new users
 *    before they have a specific membership context).
 *  - Membership.role: the user's role *within a specific organization*,
 *    which is what should be used for any organization-scoped permission
 *    check. This keeps the door open for a user to hold different roles in
 *    different organizations later.
 *
 * Phase 1 does not yet implement granular per-module permissions — that
 * belongs to a later phase once real modules (transactions, ledger, etc.)
 * exist. This file exists so future phases have a single place to extend.
 */

export const ROLES = ["ADMIN", "ACCOUNTANT", "REVIEWER", "MANAGER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  REVIEWER: "Reviewer",
  MANAGER: "Manager",
};

// Coarse capability checks. Extend this map as real modules are built.
export function canManageCompanies(role: Role) {
  return role === "ADMIN" || role === "MANAGER" || role === "ACCOUNTANT";
}

// Fiscal years / accounting periods (Phase 2B-1). Same coarse capability
// set as company management for now — REVIEWER stays read-only. Revisit
// once real modules (journal entries, closing workflows) need a finer split
// between "can create a fiscal year" and "can lock a period".
export function canManageFiscalYears(role: Role) {
  return role === "ADMIN" || role === "MANAGER" || role === "ACCOUNTANT";
}

// Chart of Accounts (Phase 3A-1). Same coarse capability set as company
// management / fiscal years for now — REVIEWER stays read-only.
export function canManageAccounts(role: Role) {
  return role === "ADMIN" || role === "MANAGER" || role === "ACCOUNTANT";
}

export function canManageMembers(role: Role) {
  return role === "ADMIN";
}

export function isAdmin(role: Role) {
  return role === "ADMIN";
}
