# AI module — Phase 4B-5

This module provides the first accounting review layer on top of the Phase 4B-4 context architecture.

- `context.ts` builds the minimized, company-scoped review input.
- `provider.ts` defines the provider-independent `AccountingAIProvider` interface.
- The default development provider is `heuristic`, a deterministic local fallback that never leaves the application and is explicitly not treated as a final accounting authority.
- `review.ts` validates structured suggestions, verifies every account against the current company, preserves normalized monetary values, persists structured suggestions, and records human review/audit events.
- `contracts.ts` remains the future-compatible suggestion contract.

Human review is mandatory. Accept/reject/edit changes only the AI review state and audit record. This phase never creates or posts Journal Entries.

The original uploaded file and extracted source remain unchanged and outside PostgreSQL binary storage.
