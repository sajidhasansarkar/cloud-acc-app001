"use client";

import * as React from "react";
import { X } from "lucide-react";

// Minimal, dependency-free modal (no Radix), matching the pattern already
// used by ToastProvider in toast.tsx. Controlled: the parent owns `open`
// state and passes it in, this component only renders/dismisses.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/40"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="relative w-full max-w-md rounded-lg border border-ink-100 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 p-4">
          <div>
            <h2 id="dialog-title" className="font-display text-sm font-semibold text-ink-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-xs text-ink-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink-400 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-ink-100 p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
