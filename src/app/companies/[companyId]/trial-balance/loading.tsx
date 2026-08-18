import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function TrialBalanceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-36 rounded bg-ink-100" />
        <div className="h-4 w-72 rounded bg-ink-100" />
      </div>
      <div className="h-28 rounded-lg border border-ink-100 bg-white" />
      <Card>
        <CardHeader>
          <div className="h-5 w-32 rounded bg-ink-100" />
          <div className="h-4 w-48 rounded bg-ink-100" />
        </CardHeader>
        <CardContent>
          <div className="h-48 rounded bg-ink-50" />
        </CardContent>
      </Card>
    </div>
  );
}
