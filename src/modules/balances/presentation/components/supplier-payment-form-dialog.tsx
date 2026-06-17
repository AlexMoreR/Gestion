"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  supplierPaymentCreateSchema,
} from "@/modules/balances/application/schemas";

type SaleOption = {
  id: string;
  code: string;
  total: number;
  clientName: string | null;
};

type SupplierOption = {
  id: string;
  name: string;
};

type SupplierPaymentFormState = {
  saleId: string;
  supplierId: string;
  amount: number;
  transactionReference: string;
  paymentDate: string;
  notes: string;
};

type SupplierPaymentFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  sales: SaleOption[];
  suppliers: SupplierOption[];
  initialValue?: {
    paymentId?: string;
    saleId?: string;
    supplierId?: string;
    amount?: number;
    transactionReference?: string;
    paymentDate?: string;
    notes?: string | null;
  } | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function SupplierPaymentFormDialog({
  open,
  mode,
  action,
  onClose,
  returnTo,
  sales,
  suppliers,
  initialValue,
}: SupplierPaymentFormDialogProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const submitBypassRef = React.useRef(false);
  const [formKey, setFormKey] = React.useState(0);

  const form = useForm<SupplierPaymentFormState>({
    resolver: zodResolver(supplierPaymentCreateSchema) as any,
    defaultValues: {
      saleId: initialValue?.saleId ?? sales[0]?.id ?? "",
      supplierId: initialValue?.supplierId ?? suppliers[0]?.id ?? "",
      amount: initialValue?.amount ?? 0,
      transactionReference: initialValue?.transactionReference ?? "",
      paymentDate: initialValue?.paymentDate ?? new Date().toISOString().slice(0, 10),
      notes: initialValue?.notes ?? "",
    },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset({
        saleId: sales[0]?.id ?? "",
        supplierId: suppliers[0]?.id ?? "",
        amount: 0,
        transactionReference: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      setFormKey((current) => current + 1);
      submitBypassRef.current = false;
      return;
    }

    form.reset({
      saleId: initialValue?.saleId ?? sales[0]?.id ?? "",
      supplierId: initialValue?.supplierId ?? suppliers[0]?.id ?? "",
      amount: initialValue?.amount ?? 0,
      transactionReference: initialValue?.transactionReference ?? "",
      paymentDate: initialValue?.paymentDate ?? new Date().toISOString().slice(0, 10),
      notes: initialValue?.notes ?? "",
    });
  }, [form, initialValue, open, sales, suppliers]);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        form.setFocus("transactionReference");
      }, 0);
    }
  }, [form, open]);

  if (!open) {
    return null;
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (submitBypassRef.current) {
      submitBypassRef.current = false;
      return;
    }

    event.preventDefault();
    const valid = await form.trigger();
    if (!valid) {
      return;
    }

    submitBypassRef.current = true;
    formRef.current?.requestSubmit();
  };

  const saleLabelById = new Map(sales.map((sale) => [sale.id, sale]));
  const supplierLabelById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const selectedSaleId = form.watch("saleId");
  const selectedSupplierId = form.watch("supplierId");
  const selectedSale = saleLabelById.get(selectedSaleId);
  const selectedSupplier = supplierLabelById.get(selectedSupplierId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nuevo pago a proveedor" : "Editar pago a proveedor"}
      onClick={onClose}
    >
      <Card className="w-full max-w-2xl rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nuevo pago a proveedor" : "Editar pago a proveedor"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Registra el pago asociado a una venta y conserva la referencia.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          key={formKey}
          ref={formRef}
          action={action}
          onSubmit={onSubmit}
          className="space-y-4 px-4 py-4"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          {initialValue?.paymentId ? <input type="hidden" name="paymentId" value={initialValue.paymentId} /> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Venta</span>
              <select className={cn(controlClassName, "appearance-none")} {...form.register("saleId")}>
                <option value="">Selecciona una venta</option>
                {sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.code} - {sale.clientName ?? "Sin cliente"}
                  </option>
                ))}
              </select>
              {selectedSale ? (
                <p className="text-xs text-muted-foreground">
                  Monto venta: ${selectedSale.total.toLocaleString("es-CO")}
                </p>
              ) : null}
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Proveedor</span>
              <select className={cn(controlClassName, "appearance-none")} {...form.register("supplierId")}>
                <option value="">Selecciona un proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {selectedSupplier ? (
                <p className="text-xs text-muted-foreground">
                  {selectedSupplier.name}
                </p>
              ) : null}
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Monto</span>
              <Input type="number" step="0.01" min="0" {...form.register("amount", { valueAsNumber: true })} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Referencia</span>
              <Input
                placeholder="Ej. TRX-2026-001"
                {...form.register("transactionReference")}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Fecha de pago</span>
              <Input type="date" {...form.register("paymentDate")} />
            </label>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-foreground">Notas</span>
              <Textarea rows={3} {...form.register("notes")} placeholder="Observaciones opcionales" />
            </label>
          </div>

          {Object.keys(form.formState.errors).length > 0 ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Revisa los campos marcados.
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">{mode === "create" ? "Registrar pago" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
