"use client";

import { adminCompleteDeliveryAction } from "@/app/actions/dispatch-actions";
import { DeliveryConfirmDialog, type DeliveryConfirmInfo } from "@/components/admin/delivery-confirm-dialog";
import { Input } from "@/components/ui/input";

type OrderDeliveryManagerProps = {
  dispatchId: string;
  returnTo: string;
  defaultInstagram: string;
  defaultTiktok: string;
  info: DeliveryConfirmInfo;
  buttonLabel?: string;
  buttonClassName?: string;
};

export function OrderDeliveryManager({
  dispatchId,
  returnTo,
  defaultInstagram,
  defaultTiktok,
  info,
  buttonLabel = "Registrar entrega",
  buttonClassName,
}: OrderDeliveryManagerProps) {
  return (
    <DeliveryConfirmDialog
      info={info}
      action={adminCompleteDeliveryAction}
      hiddenFields={{ returnTo, dispatchId }}
      buttonLabel={buttonLabel}
      buttonClassName={buttonClassName}
    >
      <p className="text-xs text-muted-foreground">
        Foto de quien recibió y redes del cliente. Todo es opcional.
      </p>

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
    </DeliveryConfirmDialog>
  );
}
