"use client";

import { useRouter } from "next/navigation";

export function ReviewCompanySwitcher({
  companies,
  currentCompanyId,
}: {
  companies: { id: string; displayName: string }[];
  currentCompanyId: string;
}) {
  const router = useRouter();

  return (
    <div className="md:col-span-4">
      <label htmlFor="review-company" className="mb-1 block text-xs text-ink-500">Company</label>
      <select
        id="review-company"
        value={currentCompanyId}
        onChange={(event) => {
          if (event.target.value) router.push(`/companies/${event.target.value}/ai-review`);
        }}
        className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm"
      >
        {companies.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
      </select>
    </div>
  );
}
