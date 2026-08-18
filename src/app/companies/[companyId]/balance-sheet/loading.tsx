import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoadingBalanceSheet() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Balance Sheet">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-64 animate-pulse rounded bg-ink-100" />
      </div>
      <div className="h-28 animate-pulse rounded-lg bg-ink-100" />
      <Card>
        <CardHeader>
          <div className="h-5 w-40 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-56 animate-pulse rounded bg-ink-100" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((row) => <div key={row} className="h-8 animate-pulse rounded bg-ink-100" />)}
        </CardContent>
      </Card>
    </div>
  );
}
