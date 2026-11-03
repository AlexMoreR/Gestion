"use client";

import { useState } from "react";
import { PackageCheck, X } from "lucide-react";
import { adminCompleteDeliveryAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OrderDeliveryManagerProps = {
  dispatchId: string;
  returnTo: string;
  defaultInstagram: string;
  defaultTiktok: string;
  canDeliver: boolean;
  display?: "button";
  buttonLabel?: string;
  buttonClassName?: string;
};

export function OrderDeliveryManager({
  dispatchId,
  returnTo,
  defaultInstagram,
  defaultTiktok,
  canDeliver,
  buttonLabel = "Registrar entrega",
  buttonClassName,
}: OrderDeliveryManagerProps) {
  const [open, setOpen] = useState(false);

  const modal = open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Registrar entrega"
      onClick={() => setOpen(false)}
    >
      <Card
        className="flex max-h-[88vh] w-full max-w-lg flex-col gap-0 overflow-y-auto rounded-xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Registrar entrega</h2>
            <p className="text-xs text-muted-foreground">
              Foto de quien recibió y redes del cliente. Todo es opcional.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={adminCompleteDeliveryAction} className="space-y-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="dispatchId" value={dispatchId} />

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Foto de la cliente que recibió
            </label>
            <Input
              type="file"
              name="deliveryPhoto"
              accept="image/*"
              capture="environment"
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">Opcional. Sirve como prueba de entrega.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Instagram del cliente
            </label>
            <Input name="instagram" defaultValue={defaultInstagram} placeholder="@usuario" />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              TikTok del cliente
            </label>
            <Input name="tiktok" defaultValue={defaultTiktok} placeholder="@usuario" />
          </div>

          <Button type="submit" className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
            <PackageCheck className="h-4 w-4" />
            Cerrar entrega
          </Button>
        </form>
      </Card>
    </div>
  ) : null;

  return (
    <>
      <Button
        type="button"
        className={buttonClassName}
        disabled={!canDeliver}
        onClick={() => setOpen(true)}
      >
        <PackageCheck className="h-4 w-4" />
        {buttonLabel}
      </Button>
      {modal}
    </>
  );
}
