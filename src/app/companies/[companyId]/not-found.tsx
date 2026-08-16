import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CompanyWorkspaceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <EmptyState
        icon={FileQuestion}
        title="Company not found"
        description="This company doesn't exist, or you don't have access to it."
        action={
          <Link href="/dashboard/companies" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to companies
          </Link>
        }
        className="py-16"
      />
    </div>
  );
}
