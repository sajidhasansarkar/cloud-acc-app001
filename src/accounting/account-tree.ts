import type { Account, AccountType } from "@prisma/client";
import { type AccountSortKey, DEFAULT_ACCOUNT_SORT } from "@/lib/constants";

/**
 * Pure, DB-free helpers that turn a flat `Account[]` (already scoped to one
 * company — see src/accounting/accounts.ts#listAccounts) into the tree /
 * search / filter / sort shapes Phase 3A-3's UI needs. Kept separate from
 * accounts.ts so the tree-building, filter-matching, and sort-comparison
 * logic can be unit-tested without touching Prisma (see
 * scripts/verify-account-hierarchy.ts).
 */

export type AccountTreeNode = {
  account: Account;
  children: AccountTreeNode[];
};

export type AccountFilters = {
  /** Matches Account Code or Account Name, case-insensitive, substring. */
  q?: string;
  type?: AccountType;
  /** Exact match against Account.subtype (a free-text field — see the
   * schema comment on Account.subtype). */
  subtype?: string;
  status?: "ACTIVE" | "INACTIVE";
};

/**
 * Orders two accounts for a given sort key. Code/name use a locale-aware,
 * numeric-aware comparison so "Account 2" sorts before "Account 10".
 */
function compareAccounts(a: Account, b: Account, sort: AccountSortKey): number {
  switch (sort) {
    case "code_asc":
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" });
    case "code_desc":
      return b.code.localeCompare(a.code, undefined, { numeric: true, sensitivity: "base" });
    case "name_asc":
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    case "name_desc":
      return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
    case "createdAt_asc":
      return a.createdAt.getTime() - b.createdAt.getTime();
    case "createdAt_desc":
      return b.createdAt.getTime() - a.createdAt.getTime();
    default:
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" });
  }
}

/**
 * Builds the parent/child tree for one company's accounts, with siblings
 * ordered by `sort` at every level (so sorting a nested tree still makes
 * sense, unlike sorting a flat list of mixed depths).
 *
 * Defensive: an account whose parentAccountId doesn't resolve to another
 * account in the same `accounts` array (shouldn't happen — accounts.ts
 * rejects cross-company parents and self/ancestor cycles on write) is
 * treated as a root instead of being silently dropped.
 */
export function buildAccountTree(
  accounts: Account[],
  sort: AccountSortKey = DEFAULT_ACCOUNT_SORT
): AccountTreeNode[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const childrenOf = new Map<string, Account[]>();
  const ROOT = "__root__";

  for (const account of accounts) {
    const key = account.parentAccountId && byId.has(account.parentAccountId)
      ? account.parentAccountId
      : ROOT;
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(account);
    else childrenOf.set(key, [account]);
  }

  function build(parentKey: string): AccountTreeNode[] {
    const kids = childrenOf.get(parentKey) ?? [];
    return [...kids]
      .sort((a, b) => compareAccounts(a, b, sort))
      .map((account) => ({ account, children: build(account.id) }));
  }

  return build(ROOT);
}

/** True when any search/filter field is set (used to switch the UI between
 * "browse the whole tree" and "showing matches for …" modes). */
export function hasActiveFilters(filters: AccountFilters): boolean {
  return Boolean(filters.q?.trim() || filters.type || filters.subtype || filters.status);
}

export function accountMatchesFilters(account: Account, filters: AccountFilters): boolean {
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    const hit = account.code.toLowerCase().includes(q) || account.name.toLowerCase().includes(q);
    if (!hit) return false;
  }
  if (filters.type && account.type !== filters.type) return false;
  if (filters.subtype && account.subtype !== filters.subtype) return false;
  if (filters.status) {
    const wantActive = filters.status === "ACTIVE";
    if (account.isActive !== wantActive) return false;
  }
  return true;
}

/** IDs of every account that matches `filters` on its own merits. */
export function getMatchingAccountIds(accounts: Account[], filters: AccountFilters): Set<string> {
  const ids = new Set<string>();
  for (const account of accounts) {
    if (accountMatchesFilters(account, filters)) ids.add(account.id);
  }
  return ids;
}

/**
 * Matched accounts plus every ancestor of a matched account. Rendering the
 * tree restricted to this set keeps the hierarchy connected (a matching
 * "Bank A" still shows under "Assets → Bank") instead of showing matches as
 * a disconnected flat list.
 */
export function getVisibleAccountIds(accounts: Account[], matchedIds: Set<string>): Set<string> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const visible = new Set<string>(matchedIds);

  for (const id of matchedIds) {
    let current = byId.get(id);
    const guard = new Set<string>(); // cycle safety net, mirrors accounts.ts#wouldCreateCycle
    while (current?.parentAccountId && !guard.has(current.id)) {
      guard.add(current.id);
      const parent = byId.get(current.parentAccountId);
      if (!parent) break;
      visible.add(parent.id);
      current = parent;
    }
  }

  return visible;
}

/** Flat, filtered, sorted list — used by the List view (accounts-table). */
export function getFilteredSortedAccounts(
  accounts: Account[],
  filters: AccountFilters,
  sort: AccountSortKey = DEFAULT_ACCOUNT_SORT
): Account[] {
  return accounts
    .filter((a) => accountMatchesFilters(a, filters))
    .sort((a, b) => compareAccounts(a, b, sort));
}

/** Distinct, sorted subtype strings actually present in `accounts`, for the
 * Subtype filter dropdown. Account.subtype is free text (see the schema
 * comment on Account), so this reflects real data rather than a fixed enum. */
export function getDistinctSubtypes(accounts: Account[]): string[] {
  const set = new Set<string>();
  for (const a of accounts) {
    if (a.subtype) set.add(a.subtype);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
