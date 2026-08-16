"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCompanyStatusAction } from "@/actions/companies";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function CompanyStatusAction({
  companyId,
  companyName,
  status,
  variant = "button",
}: {
  companyId: string;
  companyName: string;
  status: "ACTIVE" | "ONBOARDING" | "ARCHIVED";
  /** "button" for the details page, "icon" for the compact table row action. */
  variant?: "button" | "icon";
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const isArchived = status === "ARCHIVED";
  const nextStatus = isArchived ? "ACTIVE" : "ARCHIVED";
  const label = isArchived ? "Restore" : "Archive";
  const Icon = isArchived ? RotateCcw : Archive;

  function handleClick() {
    const confirmed = window.confirm(
      isArchived
        ? `Restore "${companyName}"? It will become active again.`
        : `Archive "${companyName}"? It will be hidden from active views but kept in the database.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await setCompanyStatusAction(companyId, nextStatus);
      if (result.ok) {
        toast(isArchived ? "Company restored." : "Company archived.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleClick}
        disabled={isPending}
        title={label}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800 disabled:opacity-50",
          isArchived ? "hover:text-positive" : "hover:text-negative"
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={isArchived ? "outline" : "destructive"}
      onClick={handleClick}
      disabled={isPending}
    >
      <Icon className="h-4 w-4" />
      {isPending ? "Working…" : label}
    </Button>
  );
}
