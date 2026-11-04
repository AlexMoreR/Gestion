"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  adminChangeSaleItemColorAction,
  getCartaColoresOrdenAction,
  getPartesColorOrdenAction,
  type PartesDeLineaOrden,
} from "@/app/actions/orders-actions";
import { PartesColorSelector, partesIniciales } from "@/components/admin/partes-color-selector";
import { textoColores, type ParteElegida } from "@/lib/product-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CartaColor, CartaColores } from "@/lib/carta-colores-crm";
import { COLOR_CHANGE_REASON_MAX, COLOR_CHANGE_REASON_MIN } from "@/lib/color-change";

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : "Guardar color"}
    </Button>
  );
}

// Cambia solo el color de un producto de una venta activa (con motivo). La carta es la misma
// del editor de cotizaciones; queda "Escribir otro color" a mano.
export function ChangeItemColorDialog({
  open,
  onOpenChange,
  orderItemId,
  productName,
  currentColor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  productName: string;
  currentColor: string;
}) {
  const [carta, setCarta] = useState<CartaColores | null>(null);
  const [elegido, setElegido] = useState<(CartaColor & { material: string }) | null>(null);
  const [manual, setManual] = useState(false);
  const [colorEscrito, setColorEscrito] = useState("");
  // Partes de color del producto (null = cargando). Con partes se elige un color por parte.
  const [partesLinea, setPartesLinea] = useState<PartesDeLineaOrden | null>(null);
  const [partesElegidas, setPartesElegidas] = useState<ParteElegida[]>([]);
  const conPartes = (partesLinea?.partes.length ?? 0) > 0;
  const materiales = carta?.materiales ?? [];
  const colorManual = manual || (carta !== null && materiales.length === 0);
  const color = conPartes
    ? partesElegidas.some((p) => p.color.trim())
      ? textoColores(partesElegidas)
      : ""
    : colorManual
      ? colorEscrito.trim()
      : elegido?.nombre ?? "";

  useEffect(() => {
    if (!open || partesLinea) return;
    let vivo = true;
    getPartesColorOrdenAction(orderItemId)
      .then((result) => {
        if (!vivo) return;
        setPartesLinea(result);
        setPartesElegidas(partesIniciales(result.partes, result.elegidos));
      })
      .catch(() => vivo && setPartesLinea({ productId: null, partes: [], elegidos: [] }));
    return () => {
      vivo = false;
    };
  }, [open, partesLinea, orderItemId]);

  useEffect(() => {
    if (!open || carta) return;
    let vivo = true;
    getCartaColoresOrdenAction()
      .then((result) => {
        if (vivo) setCarta(result);
      })
      .catch(() => {
        if (vivo) setCarta({ materiales: [], origen: "nada" });
      });
    return () => {
      vivo = false;
    };
  }, [open, carta]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cambiar color</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span> · color actual:{" "}
            {currentColor || "sin color"}. Cambia en la cotización, la orden, la factura y la OF (en un combo, en
            todas sus piezas). Precios y pagos no cambian; no se le avisa a nadie.
          </DialogDescription>
        </DialogHeader>

        <form action={adminChangeSaleItemColorAction} className="space-y-3">
          <input type="hidden" name="orderItemId" value={orderItemId} />
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="colorCodigo" value={colorManual ? "" : elegido?.codigo ?? ""} />
          <input type="hidden" name="colorMaterial" value={colorManual ? "" : elegido?.material ?? ""} />
          <input type="hidden" name="colorFotoUrl" value={colorManual ? "" : elegido?.fotoUrl ?? ""} />
          {conPartes ? <input type="hidden" name="partes" value={JSON.stringify(partesElegidas)} /> : null}

          {!partesLinea ? (
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando partes de color...
            </p>
          ) : conPartes ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Color por parte</span>
              {carta && carta.origen !== "crm" ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {carta.origen === "copia"
                    ? "No se pudo leer la carta del CRM. Se muestra la última copia guardada."
                    : "No se pudo leer la carta del CRM. Deja la parte como está o en «Por definir»."}
                </p>
              ) : null}
              <PartesColorSelector
                idPrefix={`cambio-${orderItemId}`}
                partes={partesLinea.partes}
                carta={carta ? materiales : null}
                elegidos={partesElegidas}
                productId={partesLinea.productId}
                onChange={setPartesElegidas}
              />
            </div>
          ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                Color nuevo
                {!colorManual && elegido ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {elegido.codigo} · {elegido.nombre} ({elegido.material})
                  </span>
                ) : null}
              </span>
              {materiales.length > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => {
                    setManual((current) => !current);
                    setElegido(null);
                    setColorEscrito("");
                  }}
                >
                  {colorManual ? "Escoger de la carta" : "Escribir otro color"}
                </Button>
              ) : null}
            </div>
            {carta && carta.origen !== "crm" ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {carta.origen === "copia"
                  ? "No se pudo leer la carta del CRM. Se muestra la última copia guardada."
                  : "No se pudo leer la carta del CRM. Escribe el color a mano."}
              </p>
            ) : null}
            {colorManual ? (
              <Input
                value={colorEscrito}
                onChange={(event) => setColorEscrito(event.target.value)}
                maxLength={80}
                placeholder="Escribe el color"
                aria-label="Color nuevo"
              />
            ) : !carta ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando colores del CRM...
              </p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-2">
                {materiales.map((material) => (
                  <div key={material.nombre} className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {material.nombre}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {material.colores.map((c) => {
                        const activo = elegido?.codigo === c.codigo && elegido.material === material.nombre;
                        return (
                          <button
                            key={`${material.nombre}-${c.codigo}`}
                            type="button"
                            aria-pressed={activo}
                            onClick={() => setElegido(activo ? null : { ...c, material: material.nombre })}
                            className={`flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors ${
                              activo ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted"
                            }`}
                          >
                            {c.fotoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.fotoUrl}
                                alt=""
                                loading="lazy"
                                className="h-8 w-8 shrink-0 rounded border border-border object-cover"
                              />
                            ) : (
                              <span className="h-8 w-8 shrink-0 rounded border border-dashed border-border bg-muted" />
                            )}
                            <span className="min-w-0">
                              <span className="block font-semibold text-foreground">{c.codigo}</span>
                              <span className="block truncate text-muted-foreground">{c.nombre}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="space-y-1">
            <label htmlFor={`motivo-${orderItemId}`} className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Textarea
              id={`motivo-${orderItemId}`}
              name="motivo"
              required
              minLength={COLOR_CHANGE_REASON_MIN}
              maxLength={COLOR_CHANGE_REASON_MAX}
              rows={2}
              placeholder="Ej.: el cliente cambió de crema a palo de rosa el 3-nov"
            />
          </div>

          {!color ? (
            <p className="text-xs text-muted-foreground">
              {conPartes ? "Escoge el color de al menos una parte para guardar." : "Escoge o escribe el color nuevo para guardar."}
            </p>
          ) : null}
          <SaveButton disabled={!color} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
