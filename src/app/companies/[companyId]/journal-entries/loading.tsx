import { Skeleton } from "@/components/ui/skeleton";

export default function JournalEntriesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card">
        <div className="space-y-3 border-b border-ink-100 p-4">
          <Skeleton className="h-9 w-full max-w-sm" />
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    </div>
  );
}
