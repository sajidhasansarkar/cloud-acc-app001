# reports module

Report route components live under `src/app/companies/[companyId]/reports`.
Phase 4B-19 adds the GST/HST Return calculation foundation at
`reports/gst-hst` and keeps it inside the existing Reports navigation.

GST/HST calculation logic is kept in `src/tax/gst-hst-return.ts` so the
existing tax and accounting access patterns remain reusable and no duplicate
accounting/report transaction store is introduced.
