"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  shippingCostCreateSchema,
} from "@/modules/balances/application/schemas";

type SaleOption = {
  id: string;
  code: string;
  clientName: string | null;
};

type AccountOption = {
  id: string;
  name: string;
};

type ShippingCostFormState = {
  saleId: string;
  shippingProvider: string;
  amount: number;
  transactionReference: string;
  paymentDate: string;
  accountId: string;
};

type ShippingCostFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  sales: SaleOption[];
  accounts: AccountOption[];
  initialValue?: {
    shippingCostId?: string;
    saleId?: string;
    shippingProvider?: string;
    amount?: number;
    transactionReference?: string;
    paymentDate?: string;
    accountId?: string | null;
  } | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ShippingCostFormDialog({
  open,
  mode,
  action,
  onClose,
  returnTo,
  sales,
  accounts,
  initialValue,
}: ShippingCostFormDialogProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const submitBypassRef = React.useRef(false);
  const [formKey, setFormKey] = React.useState(0);

  const form = useForm<ShippingCostFormState>({
    resolver: zodResolver(shippingCostCreateSchema) as any,
    defaultValues: {
      saleId: initialValue?.saleId ?? sales[0]?.id ?? "",
      shippingProvider: initialValue?.shippingProvider ?? "",
      amount: initialValue?.amount ?? 0,
      transactionReference: initialValue?.transactionReference ?? "",
      paymentDate: initialValue?.paymentDate ?? new Date().toISOString().slice(0, 10),
      accountId: initialValue?.accountId ?? "",
    },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset({
        saleId: sales[0]?.id ?? "",
        shippingProvider: "",
        amount: 0,
        transactionReference: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        accountId: "",
      });
      setFormKey((current) => current + 1);
      submitBypassRef.current = false;
      return;
    }

    form.reset({
      saleId: initialValue?.saleId ?? sales[0]?.id ?? "",
      shippingProvider: initialValue?.shippingProvider ?? "",
      amount: initialValue?.amount ?? 0,
      transactionReference: initialValue?.transactionReference ?? "",
      paymentDate: initialValue?.paymentDate ?? new Date().toISOString().slice(0, 10),
      accountId: initialValue?.accountId ?? "",
    });
  }, [form, initialValue, open, sales]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nuevo costo de envio" : "Editar costo de envio"}
      onClick={onClose}
    >
      <Card className="w-full max-w-xl rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nuevo costo de envio" : "Editar costo de envio"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Conserva el transporte y la referencia del pago.
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
          {initialValue?.shippingCostId ? (
            <input type="hidden" name="shippingCostId" value={initialValue.shippingCostId} />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-foreground">Venta</span>
              <select className={cn(controlClassName, "appearance-none")} {...form.register("saleId")}>
                <option value="">Selecciona una venta</option>
                {sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.code} - {sale.clientName ?? "Sin cliente"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Transportador</span>
              <Input placeholder="Ej. Servientrega" {...form.register("shippingProvider")} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Monto</span>
              <Input type="number" step="0.01" min="0" {...form.register("amount", { valueAsNumber: true })} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Referencia</span>
              <Input placeholder="Guia o comprobante" {...form.register("transactionReference")} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Fecha de pago</span>
              <Input type="date" {...form.register("paymentDate")} />
            </label>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-foreground">Cuenta (origen del gasto)</span>
              <select className={cn(controlClassName, "appearance-none")} {...form.register("accountId")}>
                <option value="">Sin asignar</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
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
            <Button type="submit">{mode === "create" ? "Registrar costo" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
