"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DELIVERY_CONFIRMED_FIELD } from "@/lib/delivery-confirmation";

export type DeliveryConfirmInfo = {
  orderCode: string;
  saleCode: string | null;
  clientName: string | null;
  city: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  isContraentrega: boolean;
};

type DeliveryConfirmDialogProps = {
  info: DeliveryConfirmInfo;
  action: (formData: FormData) => void | Promise<void>;
  // Campos ocultos que necesita la acción (dispatchId, returnTo, status...).
  hiddenFields: Record<string, string>;
  // Campos extra del formulario (foto y redes en el detalle de la orden).
  children?: ReactNode;
  buttonLabel: string;
  buttonClassName?: string;
  buttonSize?: "default" | "sm";
};

function ConfirmButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || !ready}
      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
    >
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Registrando..." : "Sí, se entregó"}
    </Button>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-words text-foreground">{value || "sin dato"}</dd>
    </div>
  );
}

// Ventana que pide confirmar que el cliente ya recibió antes de registrar la entrega.
// La usan el paso 4 de la orden y el botón "Entregar" de Despachos.
export function DeliveryConfirmDialog({
  info,
  action,
  hiddenFields,
  children,
  buttonLabel,
  buttonClassName,
  buttonSize = "default",
}: DeliveryConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const close = () => {
    setOpen(false);
    setChecked(false);
  };

  return (
    <>
      <Button type="button" size={buttonSize} className={buttonClassName} onClick={() => setOpen(true)}>
        <PackageCheck className={buttonSize === "sm" ? "mr-1.5 h-3.5 w-3.5" : "h-4 w-4"} />
        {buttonLabel}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-confirm-title"
          onClick={close}
        >
          <Card
            className="flex max-h-[88vh] w-full max-w-lg flex-col gap-0 overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="delivery-confirm-title" className="text-lg font-semibold text-foreground">
                ¿Confirmas que el cliente YA RECIBIÓ el pedido?
              </h2>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={close}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={action} className="space-y-3">
              {Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}

              <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                <InfoRow label="Orden" value={info.orderCode} />
                <InfoRow label="Venta" value={info.saleCode} />
                <InfoRow label="Cliente" value={info.clientName} />
                <InfoRow label="Ciudad" value={info.city} />
                <InfoRow label="Transportador" value={info.carrierName} />
                {info.trackingNumber ? <InfoRow label="Guía" value={info.trackingNumber} /> : null}
              </dl>

              {info.isContraentrega ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Al registrar la entrega, esta venta cuenta como pagada en Balances
                </p>
              ) : null}

              {children}

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  name={DELIVERY_CONFIRMED_FIELD}
                  required
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                />
                Confirmé con el cliente o con el transportador que se entregó
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="flex-1" onClick={close}>
                  Cancelar
                </Button>
                <ConfirmButton ready={checked} />
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
