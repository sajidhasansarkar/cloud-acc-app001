import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "No Access — Ledger" };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-negative/10">
        <ShieldAlert className="h-6 w-6 text-negative" />
      </div>
      <div>
        <h1 className="font-display text-lg font-semibold text-ink-900">No organization access</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-500">
          Your account isn&apos;t a member of any organization yet. Ask an administrator to add you, then sign in
          again.
        </p>
      </div>
      <Link href="/login" className={buttonVariants({ variant: "outline" })}>
        Back to sign in
      </Link>
    </div>
  );
}
