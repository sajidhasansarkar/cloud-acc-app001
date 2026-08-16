import * as React from "react";
import { cn } from "@/lib/utils";

// A plain native <select>, styled to match the rest of the UI kit.
// Kept dependency-free (no Radix) to minimize moving parts in Phase 1.
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full appearance-none rounded border border-ink-200 bg-white px-3 text-sm text-ink-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
