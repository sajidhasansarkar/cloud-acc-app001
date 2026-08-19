"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { regenerateDraftJournalEntryAction } from "@/actions/journal-entry-drafts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function DraftJournalRegenerateAction({ journalEntryId, modified }: { journalEntryId: string; modified: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function regenerate(force = false) {
    startTransition(async () => {
      const result = await regenerateDraftJournalEntryAction(journalEntryId, force);
      if (result.ok) {
        toast("Draft regenerated from the current normalized transaction.", "success");
        router.push(`/companies/${result.entry.companyId}/journal-entries/${result.entry.id}`);
        router.refresh();
      } else if (modified && !force) {
        setConfirm(true);
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => regenerate(false)} disabled={busy}>
        <RefreshCw className="h-4 w-4" />
        Regenerate Draft
      </Button>
      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-card">
            <h2 className="font-display text-base font-semibold text-ink-900">Discard manual changes?</h2>
            <p className="mt-2 text-sm text-ink-600">This draft has been modified. Regenerating will replace its current lines and header with the latest normalized transaction and account mapping.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => { setConfirm(false); regenerate(true); }}>Regenerate</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
