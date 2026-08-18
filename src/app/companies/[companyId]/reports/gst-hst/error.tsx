"use client";
export default function GstHstReturnError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-lg border border-negative/20 bg-white p-6 shadow-card"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-negative">Report Error</p><h2 className="mt-1 font-display text-lg font-semibold text-ink-900">Unable to load GST/HST Return.</h2><p className="mt-2 text-sm text-ink-500">Something went wrong while loading the report. Your accounting data was not modified.</p><button type="button" onClick={reset} className="mt-4 rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-muted">Try again</button></div>;
}
