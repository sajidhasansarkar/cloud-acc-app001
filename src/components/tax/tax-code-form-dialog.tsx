"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TaxCodeForm } from "@/components/tax/tax-code-form";
import type { SerializedTaxCode } from "@/components/tax/types";

type BaseProps = {
  companyId: string;
};

type CreateProps = BaseProps & {
  mode: "create";
  taxCode?: undefined;
  triggerSize?: "default" | "sm";
  triggerLabel?: string;
};

type EditProps = BaseProps & {
  mode: "edit";
  taxCode: SerializedTaxCode;
};

export function TaxCodeFormDialog(props: CreateProps | EditProps) {
  const { mode, companyId } = props;
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
          {props.triggerLabel ?? "Add Tax Code"}
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
        title={mode === "edit" ? "Edit Tax Code" : "Add Tax Code"}
        description={
          mode === "edit"
            ? `Update details for ${props.taxCode.code} — ${props.taxCode.name}.`
            : "Add a new tax code for this company."
        }
      >
        {open ? (
          <TaxCodeForm
            mode={mode}
            companyId={companyId}
            taxCode={mode === "edit" ? props.taxCode : undefined}
            onSuccess={handleSuccess}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
