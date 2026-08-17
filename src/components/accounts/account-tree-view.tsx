"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, Maximize2, Minimize2, SearchX } from "lucide-react";
import { AccountStatusBadge } from "@/components/accounts/account-status-badge";
import { AccountViewDialog } from "@/components/accounts/account-view-dialog";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountStatusAction } from "@/components/accounts/account-status-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AccountTreeNode } from "@/accounting/account-tree";
import type { Account, AccountType } from "@prisma/client";

/**
 * Collects every id in the tree (roots + all descendants), used to build
 * the "expand all" set and to walk the tree for id lookups.
 */
function allIds(nodes: AccountTreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    acc.push(node.account.id);
    allIds(node.children, acc);
  }
  return acc;
}

function TreeRow({
  node,
  depth,
  companyId,
  allAccounts,
  canManage,
  expanded,
  onToggle,
  filtering,
  matchedIds,
}: {
  node: AccountTreeNode;
  depth: number;
  companyId: string;
  allAccounts: Account[];
  canManage: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  filtering: boolean;
  matchedIds: Set<string>;
}) {
  const { account, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(account.id);
  const isMatch = !filtering || matchedIds.has(account.id);
  const parent = account.parentAccountId
    ? allAccounts.find((a) => a.id === account.parentAccountId) ?? null
    : null;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 border-b border-ink-50 py-2 pr-3 last:border-b-0 hover:bg-surface-muted",
          !isMatch && "opacity-50"
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(account.id)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-400",
            hasChildren ? "hover:bg-ink-100 hover:text-ink-700" : "invisible"
          )}
          aria-label={isOpen ? "Collapse" : "Expand"}
          tabIndex={hasChildren ? 0 : -1}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <span className="w-24 shrink-0 truncate font-mono text-xs font-medium text-ink-900">
          {account.code}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            isMatch && filtering ? "font-semibold text-ink-900" : "font-medium text-ink-900"
          )}
        >
          {account.name}
        </span>
        <span className="hidden w-24 shrink-0 text-xs text-ink-500 sm:block">
          {ACCOUNT_TYPE_LABELS[account.type as AccountType]}
        </span>
        <span className="hidden w-32 shrink-0 truncate text-xs text-ink-500 md:block">
          {account.subtype || "—"}
        </span>
        <span className="hidden shrink-0 sm:block">
          <AccountStatusBadge isActive={account.isActive} />
        </span>
        {hasChildren ? (
          <span className="hidden shrink-0 text-xs text-ink-400 lg:block">
            {children.length} {children.length === 1 ? "child" : "children"}
          </span>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          <AccountViewDialog
            account={account}
            parentAccount={parent}
            childAccounts={children.map((c) => c.account)}
          />
          {canManage ? (
            <>
              <AccountFormDialog mode="edit" companyId={companyId} account={account} accounts={allAccounts} />
              <AccountStatusAction
                companyId={companyId}
                accountId={account.id}
                accountLabel={`${account.code} — ${account.name}`}
                isActive={account.isActive}
              />
            </>
          ) : null}
        </div>
      </div>

      {hasChildren && isOpen ? (
        <div>
          {children.map((child) => (
            <TreeRow
              key={child.account.id}
              node={child}
              depth={depth + 1}
              companyId={companyId}
              allAccounts={allAccounts}
              canManage={canManage}
              expanded={expanded}
              onToggle={onToggle}
              filtering={filtering}
              matchedIds={matchedIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AccountTreeView({
  companyId,
  tree,
  allAccounts,
  canManage,
  filtering,
  matchedIds,
  visibleIds,
  matchedCount,
}: {
  companyId: string;
  tree: AccountTreeNode[];
  /** Full company account list — used for parent lookups and the "Parent
   * Account" dropdown inside the edit/view dialogs. */
  allAccounts: Account[];
  canManage: boolean;
  /** True when search/filters narrowed the tree — switches to "show
   * matches + their ancestors, dim the rest" mode. */
  filtering: boolean;
  matchedIds: Set<string>;
  /** Matches + ancestors of matches — the only nodes rendered while
   * filtering, so the hierarchy stays connected. */
  visibleIds: Set<string>;
  matchedCount: number;
}) {
  // Default: everything collapsed. While filtering, every visible
  // (matched-or-ancestor) node is auto-expanded so matches are reachable
  // without a click; the user can still collapse individual nodes by hand
  // afterwards, and a change to the search/filters re-expands whatever is
  // newly needed without clobbering unrelated manual collapses.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!filtering) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Only re-run when the set of ids to reveal changes, not on every
    // manual expand/collapse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, visibleIds]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(allIds(tree)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  const visibleTree = filtering ? pruneTree(tree, visibleIds) : tree;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
        <p className="text-xs text-ink-500">
          {filtering
            ? `${matchedCount} matching ${matchedCount === 1 ? "account" : "accounts"}`
            : `${allAccounts.length} ${allAccounts.length === 1 ? "account" : "accounts"} total`}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 hover:bg-surface-muted hover:text-ink-800"
          >
            <Maximize2 className="h-3 w-3" />
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-500 hover:bg-surface-muted hover:text-ink-800"
          >
            <Minimize2 className="h-3 w-3" />
            Collapse all
          </button>
        </div>
      </div>

      {visibleTree.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={SearchX}
            title="No matching accounts"
            description="Try a different search term or clear your filters."
          />
        </div>
      ) : (
        <div>
          {visibleTree.map((node) => (
            <TreeRow
              key={node.account.id}
              node={node}
              depth={0}
              companyId={companyId}
              allAccounts={allAccounts}
              canManage={canManage}
              expanded={expanded}
              onToggle={toggle}
              filtering={filtering}
              matchedIds={matchedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Returns a copy of `nodes` containing only nodes whose id is in
 * `visibleIds` (checked recursively) — used to hide branches that have no
 * match anywhere underneath while filtering. */
function pruneTree(nodes: AccountTreeNode[], visibleIds: Set<string>): AccountTreeNode[] {
  const result: AccountTreeNode[] = [];
  for (const node of nodes) {
    if (!visibleIds.has(node.account.id)) continue;
    result.push({ account: node.account, children: pruneTree(node.children, visibleIds) });
  }
  return result;
}
