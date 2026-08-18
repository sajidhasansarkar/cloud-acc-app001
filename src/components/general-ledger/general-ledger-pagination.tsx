import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GeneralLedgerPagination({ page, pageSize, total, totalPages, query }: { page: number; pageSize: number; total: number; totalPages: number; query: Record<string, string> }) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const makeHref = (nextPage: number) => {
    const params = new URLSearchParams(query);
    params.set("page", String(nextPage));
    return `?${params.toString()}`;
  };
  return (
    <div className="flex flex-col gap-3 border-t border-ink-100 px-4 py-3 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex items-center gap-2">
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")} href={makeHref(Math.max(1, page - 1))}>Previous</Link>
        <span className="min-w-20 text-center">Page {page} of {totalPages}</span>
        <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= totalPages && "pointer-events-none opacity-50")} href={makeHref(Math.min(totalPages, page + 1))}>Next</Link>
      </div>
    </div>
  );
}
