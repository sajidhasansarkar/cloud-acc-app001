"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { initials } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-subtle"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">
          {initials(name) || <User className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-ink-900">{name}</span>
          <span className="block text-xs text-ink-500">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-ink-100 bg-white py-1 shadow-lg">
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-negative hover:bg-negative/5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
