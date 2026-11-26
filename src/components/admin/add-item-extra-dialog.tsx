"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { adminAddSaleItemExtraAction, adminPreviewSaleItemExtraAction } from "@/app/actions/orders-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ADICIONAL_DESCRIPCION_MAX, ADICIONAL_DESCRIPCION_MIN } from "@/lib/sale-item-extra";
import type { VistaAdicional } from "@/lib/sale-item-extra.server";

const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : "Agregar adicional"}
    </Button>
  );
}

// Suma un adicional con precio (ej. base cromada +50.000) a un producto de una venta ya creada.
// La acción (parte 1) sube línea, cotización, venta y orden sin tocar abonos; el mensaje sale por ?ok=.
export function AddItemExtraDialog({
  open,
  onOpenChange,
  orderItemId,
  productName,
  puedeCosto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  productName: string;
  /** Solo fabricación con proveedora confirmada: el costo se le carga a ella. */
  puedeCosto: boolean;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [vista, setVista] = useState<VistaAdicional | { error: string } | null>(null);
  const costoEnviado = puedeCosto ? costo : "";
  const listo =
    descripcion.trim().length >= ADICIONAL_DESCRIPCION_MIN && Number(precio) > 0;

  // Antes y después (sin guardar), un momento después de dejar de escribir.
  useEffect(() => {
    if (!listo) {
      setVista(null);
      return;
    }
    let vivo = true;
    setVista(null);
    const timer = setTimeout(() => {
      const fd = new FormData();
      fd.set("orderItemId", orderItemId);
      fd.set("descripcion", descripcion);
      fd.set("precio", precio);
      fd.set("costo", costoEnviado);
      adminPreviewSaleItemExtraAction(fd)
        .then((res) => vivo && setVista(res))
        .catch(() => vivo && setVista({ error: "No se pudo calcular el antes y el después." }));
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [listo, orderItemId, descripcion, precio, costoEnviado]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar adicional</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span>. Sube el total y el saldo de la venta;
            los abonos no se tocan.
          </DialogDescription>
        </DialogHeader>

        <form action={adminAddSaleItemExtraAction} className="space-y-3">
          <input type="hidden" name="orderItemId" value={orderItemId} />
          <div className="space-y-1.5">
            <label htmlFor="extra-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input
              id="extra-descripcion"
              name="descripcion"
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              minLength={ADICIONAL_DESCRIPCION_MIN}
              maxLength={ADICIONAL_DESCRIPCION_MAX}
              placeholder="Ej.: Base cromada"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="extra-precio" className="text-sm font-medium text-foreground">
              Precio al cliente (COP)
            </label>
            <Input
              id="extra-precio"
              name="precio"
              type="number"
              inputMode="numeric"
              min={1}
              step="any"
              value={precio}
              onChange={(event) => setPrecio(event.target.value)}
              placeholder="50000"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="extra-costo" className="text-sm font-medium text-foreground">
              Costo con la proveedora (opcional)
            </label>
            <Input
              id="extra-costo"
              name="costo"
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              value={costoEnviado}
              onChange={(event) => setCosto(event.target.value)}
              disabled={!puedeCosto}
              placeholder="0"
            />
            {!puedeCosto ? (
              <p className="text-xs text-muted-foreground">Solo con proveedora confirmada en fabricación.</p>
            ) : null}
          </div>

          {!listo ? (
            <p className="text-xs text-muted-foreground">Escribe la descripción y el precio para ver el antes y el después.</p>
          ) : vista === null ? (
            <p className="text-xs text-muted-foreground">Calculando el antes y el después...</p>
          ) : "error" in vista ? (
            <p className="text-sm text-destructive">{vista.error}</p>
          ) : (
            <div className="space-y-1 rounded-lg border border-border p-2.5 text-sm">
              <p className="font-medium text-foreground">Antes → después</p>
              {[
                ["Total de la venta", vista.totalAntes, vista.totalDespues] as const,
                ["Saldo por cobrar", vista.saldoAntes, vista.saldoDespues] as const,
              ].map(([label, antes, despues]) => (
                <p key={label} className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">
                    {pesos(antes)} → {pesos(despues)}
                  </span>
                </p>
              ))}
              <p className="text-xs text-muted-foreground">Pagado: {pesos(vista.pagado)} (no cambia)</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <SaveButton disabled={!listo || vista === null || "error" in vista} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
