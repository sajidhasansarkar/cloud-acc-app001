import { Skeleton } from "@/components/ui/skeleton";
export default function LoadingGstHstReturn() {
  return <div className="space-y-6" aria-busy="true" aria-label="Loading GST/HST Return"><div className="space-y-2 border-b border-ink-100 pb-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-52" /><Skeleton className="h-4 w-72" /></div><Skeleton className="h-36 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div>;
}
