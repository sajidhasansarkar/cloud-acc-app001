import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CompanyNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Company not found"
      description="This company doesn't exist, or belongs to a different organization."
      action={
        <Link href="/dashboard/companies" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to companies
        </Link>
      }
      className="py-24"
    />
  );
}
