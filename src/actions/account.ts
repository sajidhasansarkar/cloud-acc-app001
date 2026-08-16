"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  changePasswordSchema,
  type ChangePasswordFieldErrors,
} from "@/lib/validations";

export type ChangePasswordFormState = {
  error?: string;
  success?: boolean;
  fieldErrors?: ChangePasswordFieldErrors;
};

function toFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: ChangePasswordFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof ChangePasswordFieldErrors;
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Lets the currently signed-in user change their own password.
 *
 * - Requires an active session (requireUser redirects to /login otherwise).
 * - Re-fetches the user's current passwordHash from the database rather
 *   than trusting anything from the client, and verifies the submitted
 *   "current password" against it with bcrypt before allowing the change.
 * - Never touches other users' records — the update is always scoped to
 *   the authenticated user's own id.
 */
export async function changePasswordAction(
  _prevState: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  const sessionUser = await requireUser();

  const input = {
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) {
    return { error: "Your account could not be found. Please sign in again." };
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash
  );
  if (!isCurrentPasswordValid) {
    return {
      fieldErrors: { currentPassword: "Current password is incorrect" },
    };
  }

  const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash },
  });

  return { success: true };
}
