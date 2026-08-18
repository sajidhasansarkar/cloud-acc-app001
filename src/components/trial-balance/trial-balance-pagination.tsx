import Link from "next/link";

const buttonClass = "inline-flex h-8 items-center justify-center rounded border border-ink-200 bg-white px-3 text-sm font-medium text-ink-800 transition-colors hover:bg-surface-muted";
const disabledClass = "pointer-events-none opacity-50";

export function TrialBalancePagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  query: Record<string, string>;
}) {
  if (totalPages <= 1) return null;
  const makeHref = (targetPage: number) => {
    const params = new URLSearchParams(query);
    params.set("page", String(targetPage));
    return `?${params.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
      <span className="text-xs text-ink-500">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Link href={makeHref(Math.max(1, page - 1))} className={`${buttonClass} ${page <= 1 ? disabledClass : ""}`}>Previous</Link>
        <Link href={makeHref(Math.min(totalPages, page + 1))} className={`${buttonClass} ${page >= totalPages ? disabledClass : ""}`}>Next</Link>
      </div>
    </div>
  );
}
