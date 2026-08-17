import type { AccountMapping } from "@prisma/client";

// Lightweight option shapes for the Account / Tax Code pickers and for
// resolving a mapping's accountId / taxCodeId into a display label. Kept
// deliberately small (id/code/name only) rather than passing full
// Account / TaxCode rows into client components — the mapping form and
// table never need anything else from those records.
export type AccountOption = { id: string; code: string; name: string };
export type TaxCodeOption = { id: string; code: string; name: string };

export function accountLabel(account: AccountOption | undefined): string {
  return account ? `${account.code} — ${account.name}` : "—";
}

export function taxCodeLabel(taxCode: TaxCodeOption | undefined): string {
  return taxCode ? `${taxCode.code} — ${taxCode.name}` : "—";
}

export function buildAccountLookup(accounts: AccountOption[]): Map<string, AccountOption> {
  return new Map(accounts.map((a) => [a.id, a]));
}

export function buildTaxCodeLookup(taxCodes: TaxCodeOption[]): Map<string, TaxCodeOption> {
  return new Map(taxCodes.map((t) => [t.id, t]));
}

export type { AccountMapping };
