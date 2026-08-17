"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function JournalEntriesPagination({ page, pageSize, total, totalPages }: { page: number; pageSize: number; total: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function goTo(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col gap-3 border-t border-ink-100 px-4 py-3 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pending || page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <span className="min-w-20 text-center">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={pending || page >= totalPages} onClick={() => goTo(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
