import type { TaxCode } from "@prisma/client";

// Prisma.Decimal instances aren't plain objects, so they can't cross the
// Server -> Client Component boundary as-is (unlike Account, TaxCode has a
// Decimal `rate` field). The tax settings page converts each TaxCode to
// this shape — `rate` as a plain number — before handing rows to any
// "use client" component below. Every other field is unchanged.
export type SerializedTaxCode = Omit<TaxCode, "rate"> & { rate: number };

export function serializeTaxCode(taxCode: TaxCode): SerializedTaxCode {
  return { ...taxCode, rate: taxCode.rate.toNumber() };
}
