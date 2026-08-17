"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MappingForm } from "@/components/mapping/mapping-form";
import type { AccountOption, TaxCodeOption } from "@/components/mapping/types";
import type { AccountMapping } from "@prisma/client";

type BaseProps = {
  companyId: string;
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
};

type CreateProps = BaseProps & {
  mode: "create";
  mapping?: undefined;
  triggerSize?: "default" | "sm";
  triggerLabel?: string;
};

type EditProps = BaseProps & {
  mode: "edit";
  mapping: AccountMapping;
};

export function MappingFormDialog(props: CreateProps | EditProps) {
  const { mode, companyId, accounts, taxCodes } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button
          type="button"
          variant="primary"
          size={props.triggerSize ?? "default"}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {props.triggerLabel ?? "Add Mapping"}
        </Button>
      ) : (
        <button
          type="button"
          title="Edit"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-500 hover:bg-surface-muted hover:text-ink-800"
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit</span>
        </button>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={mode === "edit" ? "Edit Mapping" : "Add Mapping"}
        description={
          mode === "edit"
            ? `Update details for "${props.mapping.name}".`
            : "Add a new account mapping rule for this company."
        }
      >
        {open ? (
          <MappingForm
            mode={mode}
            companyId={companyId}
            mapping={mode === "edit" ? props.mapping : undefined}
            accounts={accounts}
            taxCodes={taxCodes}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
