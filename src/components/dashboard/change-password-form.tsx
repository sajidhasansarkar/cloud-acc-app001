"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { changePasswordAction, type ChangePasswordFormState } from "@/actions/account";

const initialState: ChangePasswordFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Updating…" : "Update password"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form fields after a successful change — passwords shouldn't
  // linger in the DOM once they've been submitted.
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Update the password used to sign in to this workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="max-w-sm space-y-4">
          {state?.success ? (
            <div className="flex items-start gap-2 rounded border border-positive/30 bg-positive/5 px-3 py-2 text-sm text-positive">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Your password has been updated.</span>
            </div>
          ) : null}

          {state?.error ? (
            <div className="flex items-start gap-2 rounded border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            {state?.fieldErrors?.currentPassword ? (
              <p className="text-xs text-negative">{state.fieldErrors.currentPassword}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
            <p className="text-xs text-ink-500">At least 8 characters.</p>
            {state?.fieldErrors?.newPassword ? (
              <p className="text-xs text-negative">{state.fieldErrors.newPassword}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
            {state?.fieldErrors?.confirmPassword ? (
              <p className="text-xs text-negative">{state.fieldErrors.confirmPassword}</p>
            ) : null}
          </div>

          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
