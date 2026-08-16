import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Ledger" };

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ledger-500 font-display text-lg font-bold text-white">
            L
          </div>
          <h1 className="font-display text-lg font-semibold text-white">Ledger</h1>
          <p className="text-sm text-ink-400">Sign in to your internal accounting workspace</p>
        </div>

        <div className="rounded-lg border border-ink-800 bg-white p-6 shadow-card">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-ink-500">
          Internal staff access only. Clients do not sign in to this system.
        </p>
      </div>
    </div>
  );
}
