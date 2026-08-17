"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MappingStatusBadge } from "@/components/mapping/mapping-status-badge";
import { MappingFormDialog } from "@/components/mapping/mapping-form-dialog";
import { MappingStatusAction } from "@/components/mapping/mapping-status-action";
import { MappingDeleteAction } from "@/components/mapping/mapping-delete-action";
import { accountLabel, taxCodeLabel, buildAccountLookup, buildTaxCodeLookup } from "@/components/mapping/types";
import type { AccountOption, TaxCodeOption } from "@/components/mapping/types";
import { MAPPING_SOURCE_TYPE_LABELS } from "@/lib/constants";
import type { AccountMapping, MappingSourceType } from "@prisma/client";

export function MappingsTable({
  companyId,
  mappings,
  accounts,
  taxCodes,
  canManage,
}: {
  companyId: string;
  mappings: AccountMapping[];
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  canManage: boolean;
}) {
  const accountLookup = buildAccountLookup(accounts);
  const taxCodeLookup = buildTaxCodeLookup(taxCodes);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mapping Name</TableHead>
          <TableHead>Source Type</TableHead>
          <TableHead>Source Value</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Tax Code</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mappings.map((mapping) => (
          <TableRow key={mapping.id}>
            <TableCell className="font-medium">{mapping.name}</TableCell>
            <TableCell className="text-ink-500">
              {MAPPING_SOURCE_TYPE_LABELS[mapping.sourceType as MappingSourceType]}
            </TableCell>
            <TableCell className="font-mono text-xs text-ink-700">{mapping.sourceValue}</TableCell>
            <TableCell className="text-ink-500">
              {accountLabel(mapping.accountId ? accountLookup.get(mapping.accountId) : undefined)}
            </TableCell>
            <TableCell className="text-ink-500">
              {taxCodeLabel(mapping.taxCodeId ? taxCodeLookup.get(mapping.taxCodeId) : undefined)}
            </TableCell>
            <TableCell className="text-ink-500">{mapping.priority}</TableCell>
            <TableCell>
              <MappingStatusBadge isActive={mapping.isActive} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {canManage ? (
                  <>
                    <MappingFormDialog
                      mode="edit"
                      companyId={companyId}
                      mapping={mapping}
                      accounts={accounts}
                      taxCodes={taxCodes}
                    />
                    <MappingStatusAction
                      companyId={companyId}
                      mappingId={mapping.id}
                      mappingLabel={mapping.name}
                      isActive={mapping.isActive}
                    />
                    <MappingDeleteAction
                      companyId={companyId}
                      mappingId={mapping.id}
                      mappingLabel={mapping.name}
                      isActive={mapping.isActive}
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
