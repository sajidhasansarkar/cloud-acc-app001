import Link from "next/link";
import { Button } from "@/components/ui/button";
export function DocumentsPagination({ companyId, page, pageCount }: { companyId: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => `/companies/${companyId}/documents?page=${p}`;
  return <div className="flex items-center justify-between rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm shadow-card"><span className="text-ink-500">Page {page} of {pageCount}</span><div className="flex gap-2"><Link href={href(Math.max(1, page - 1))}><Button variant="outline" size="sm" disabled={page <= 1}>Previous</Button></Link><Link href={href(Math.min(pageCount, page + 1))}><Button variant="outline" size="sm" disabled={page >= pageCount}>Next</Button></Link></div></div>;
}
