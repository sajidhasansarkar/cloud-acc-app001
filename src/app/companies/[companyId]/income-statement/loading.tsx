import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingIncomeStatement() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Income Statement">
      <div className="flex items-end justify-between border-b border-ink-100 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="hidden h-14 w-28 sm:block" />
      </div>
      <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card">
        <div className="space-y-3 border-b border-ink-100 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-72" /></div>
        <div className="space-y-3 p-6">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
      </div>
    </div>
  );
}
