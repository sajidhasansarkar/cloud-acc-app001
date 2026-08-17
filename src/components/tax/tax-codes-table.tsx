"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaxCodeStatusBadge } from "@/components/tax/tax-code-status-badge";
import { TaxCodeFormDialog } from "@/components/tax/tax-code-form-dialog";
import { TaxCodeStatusAction } from "@/components/tax/tax-code-status-action";
import { TAX_TYPE_LABELS, TAX_COUNTRIES } from "@/lib/constants";
import type { SerializedTaxCode } from "@/components/tax/types";
import type { TaxType } from "@prisma/client";

const COUNTRY_NAME_BY_CODE = new Map<string, string>(
  TAX_COUNTRIES.map((c) => [c.countryCode, c.countryName])
);

function formatRate(rate: number): string {
  // Trim trailing zeros from the stored Decimal(7,4) without losing a
  // meaningful fraction (e.g. 13 -> "13%", 5.5 -> "5.5%", 0 -> "0%").
  return `${rate % 1 === 0 ? rate : rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function TaxCodesTable({
  companyId,
  taxCodes,
  canManage,
}: {
  companyId: string;
  taxCodes: SerializedTaxCode[];
  canManage: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tax Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Country</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {taxCodes.map((taxCode) => (
          <TableRow key={taxCode.id}>
            <TableCell className="font-mono text-xs font-medium text-ink-900">{taxCode.code}</TableCell>
            <TableCell className="font-medium">{taxCode.name}</TableCell>
            <TableCell className="text-ink-500">{TAX_TYPE_LABELS[taxCode.taxType as TaxType]}</TableCell>
            <TableCell className="text-ink-500">{formatRate(taxCode.rate)}</TableCell>
            <TableCell className="text-ink-500">
              {COUNTRY_NAME_BY_CODE.get(taxCode.countryCode) ?? taxCode.countryCode}
            </TableCell>
            <TableCell>
              <TaxCodeStatusBadge isActive={taxCode.isActive} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {canManage ? (
                  <>
                    <TaxCodeFormDialog mode="edit" companyId={companyId} taxCode={taxCode} />
                    <TaxCodeStatusAction
                      companyId={companyId}
                      taxCodeId={taxCode.id}
                      taxCodeLabel={`${taxCode.code} — ${taxCode.name}`}
                      isActive={taxCode.isActive}
                    />
                  </>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
