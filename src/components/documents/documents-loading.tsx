import { Skeleton } from "@/components/ui/skeleton";
export function DocumentsLoading(){return <div className="space-y-6" aria-busy="true" aria-label="Loading documents"><div className="flex items-center justify-between"><Skeleton className="h-7 w-40"/><Skeleton className="h-9 w-32"/></div><Skeleton className="h-28 w-full"/><Skeleton className="h-64 w-full"/></div>}
