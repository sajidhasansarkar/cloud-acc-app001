import { requireActiveOrganization } from "@/lib/session";
import { ChangePasswordForm } from "@/components/dashboard/change-password-form";

export const metadata = { title: "Settings — Ledger" };

export default async function SettingsPage() {
  await requireActiveOrganization();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500">Organization and platform preferences.</p>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
