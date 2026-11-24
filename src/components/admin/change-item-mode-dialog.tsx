"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  adminCambiarModoConfirmadoAction,
  opcionesCambioModoAction,
  previsualizarCambioModoAction,
} from "@/app/actions/order-item-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVO_CAMBIO_MAX, MOTIVO_CAMBIO_MIN } from "@/lib/order-item-mode-change";
import type { OpcionesCambio, VistaCambio } from "@/lib/order-item-mode-change.server";

const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function GuardarBoton({ disabled, aStock }: { disabled: boolean; aStock: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : aStock ? "Pasar a stock" : "Pasar a fabricación"}
    </Button>
  );
}

function Cambio({ antes, despues, dinero = true }: { antes: number; despues: number; dinero?: boolean }) {
  const f = dinero ? pesos : (v: number) => String(v);
  return (
    <span className={antes === despues ? "text-muted-foreground" : "font-medium text-foreground"}>
      {f(antes)} → {f(despues)}
    </span>
  );
}

// Pasa a Stock (o a Fabricación) un producto ya confirmado, aunque esté entregado (T-846). Antes de
// guardar muestra el antes y el después: deuda con la proveedora, inventario y costo de la venta.
export function ChangeItemModeDialog({
  open,
  onOpenChange,
  orderItemId,
  manufacturingOrderId,
  productName,
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  returnTo: string;
} & ({ orderItemId: string; manufacturingOrderId?: undefined } | { manufacturingOrderId: string; orderItemId?: undefined })) {
  // Un producto (orderItemId) o toda una OF (manufacturingOrderId); el servidor arma las piezas.
  const campo = manufacturingOrderId ? { name: "manufacturingOrderId", value: manufacturingOrderId } : { name: "orderItemId", value: orderItemId ?? "" };
  const [opciones, setOpciones] = useState<OpcionesCambio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compraId, setCompraId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [vista, setVista] = useState<VistaCambio | null>(null);
  const [viendo, setViendo] = useState(false);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    opcionesCambioModoAction(manufacturingOrderId ? { manufacturingOrderId } : { orderItemId: orderItemId ?? "" })
      .then((res) => {
        if (!vivo) return;
        if ("error" in res) return setError(res.error);
        setOpciones(res);
        setCompraId(res.compras[0]?.id ?? "");
        const sugerida = res.proveedoraSugerida ?? "";
        setSupplierId(sugerida);
        setCostos(costosDe(res, sugerida));
      })
      .catch(() => vivo && setError("No se pudieron cargar las opciones."));
    return () => {
      vivo = false;
    };
  }, [open, orderItemId, manufacturingOrderId]);

  const aStock = opciones?.direccion !== "A_FABRICACION";
  const datos = () => {
    const fd = new FormData();
    fd.set(campo.name, campo.value);
    if (aStock) fd.set("compraId", compraId);
    else {
      fd.set("supplierId", supplierId);
      for (const [id, valor] of Object.entries(costos)) fd.set(`costo_${id}`, valor);
    }
    return fd;
  };
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVista(null);
  };

  const verCambios = async () => {
    setViendo(true);
    setError(null);
    try {
      const res = await previsualizarCambioModoAction(datos());
      if ("error" in res) setError(res.error);
      else setVista(res);
    } catch {
      setError("No se pudo calcular el antes y el después.");
    } finally {
      setViendo(false);
    }
  };

  const listo = vista !== null && motivo.trim().length >= MOTIVO_CAMBIO_MIN;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{opciones ? (aStock ? "Pasar a stock" : "Pasar a fabricación") : "Cambiar Fabricación / Stock"}</DialogTitle>
          <DialogDescription>
            {opciones?.producto ?? productName}
            {opciones && opciones.piezas.length > 1 ? ` · combo: cambian sus ${opciones.piezas.length} piezas` : ""}
          </DialogDescription>
        </DialogHeader>

        {!opciones && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </p>
        ) : null}

        {opciones ? (
          <form action={adminCambiarModoConfirmadoAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name={campo.name} value={campo.value} />
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {aStock ? (
                <>
                  <li>Se anula el cargo a la proveedora de esta orden (queda en Anulados con el motivo) y su producción.</li>
                  <li>Las piezas salen del inventario y quedan con el costo de la compra que elijas.</li>
                </>
              ) : (
                <>
                  <li>Las piezas vuelven al inventario.</li>
                  <li>Se le carga a la proveedora el costo que escribas (la deuda) y la orden queda con su OF.</li>
                </>
              )}
              <li>No cambia la venta, los abonos, la entrega, el despacho ni el flete.</li>
            </ul>

            {aStock ? (
              <div className="space-y-1.5">
                <label htmlFor="cambio-compra" className="text-sm font-medium text-foreground">
                  Compra de inventario de donde salió
                </label>
                <select id="cambio-compra" name="compraId" value={compraId} onChange={(e) => cambiar(setCompraId)(e.target.value)} className={selectClass}>
                  {opciones.compras.map((compra) => (
                    <option key={compra.id} value={compra.id}>
                      {compra.etiqueta} · {pesos(opciones.piezas.reduce((s, p) => s + (compra.costos[p.id] ?? 0) * p.cantidad, 0))}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="cambio-proveedora" className="text-sm font-medium text-foreground">
                    Proveedora que lo fabrica
                  </label>
                  <select
                    id="cambio-proveedora"
                    name="supplierId"
                    value={supplierId}
                    onChange={(e) => {
                      cambiar(setSupplierId)(e.target.value);
                      setCostos(costosDe(opciones, e.target.value));
                    }}
                    className={selectClass}
                  >
                    <option value="">Elegir proveedora</option>
                    {opciones.proveedoras.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Costo por unidad (lo que cobra la proveedora)</p>
                  {opciones.piezas.map((pieza) => (
                    <div key={pieza.id} className="flex items-center gap-2">
                      <label htmlFor={`costo-${pieza.id}`} className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
                        {pieza.nombre} · x{pieza.cantidad}
                      </label>
                      <Input
                        id={`costo-${pieza.id}`}
                        name={`costo_${pieza.id}`}
                        inputMode="numeric"
                        value={costos[pieza.id] ?? ""}
                        onChange={(e) => cambiar((v: string) => setCostos((c) => ({ ...c, [pieza.id]: v })))(e.target.value)}
                        className="h-9 w-32 shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="cambio-motivo" className="text-sm font-medium text-foreground">
                Motivo
              </label>
              <Textarea
                id="cambio-motivo"
                name="motivo"
                rows={2}
                maxLength={MOTIVO_CAMBIO_MAX}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={aStock ? "Ej.: salió de los 6 combos de la ORD-99" : "Ej.: no había en bodega, lo hizo la proveedora"}
                required
              />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={verCambios} disabled={viendo}>
              {viendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Ver antes y después
            </Button>

            {vista ? (
              <div className="space-y-2 rounded-lg border border-border p-2.5 text-sm">
                <p className="font-medium text-foreground">Antes → después</p>
                {vista.proveedoras.map((p) => (
                  <p key={p.nombre} className="flex flex-wrap justify-between gap-x-3">
                    <span className="text-muted-foreground">Deuda con {p.nombre}</span>
                    <Cambio antes={p.deudaAntes} despues={p.deudaDespues} />
                  </p>
                ))}
                {vista.proveedoras.length === 0 ? <p className="text-muted-foreground">Esta orden no tenía cargo a la proveedora.</p> : null}
                <div className="space-y-1">
                  {vista.piezas.map((p) => (
                    <div key={p.id} className="rounded-md bg-muted/40 px-2 py-1 text-xs">
                      <p className="break-words font-medium text-foreground">
                        {p.nombre} · x{p.cantidad}
                      </p>
                      <p className="flex flex-wrap justify-between gap-x-3">
                        <span className="text-muted-foreground">Inventario</span>
                        <Cambio antes={p.stockAntes} despues={p.stockDespues} dinero={false} />
                      </p>
                      <p className="flex flex-wrap justify-between gap-x-3">
                        <span className="text-muted-foreground">Costo por unidad</span>
                        <Cambio antes={p.costoAntes} despues={p.costoDespues} />
                      </p>
                    </div>
                  ))}
                </div>
                <p className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-muted-foreground">Costo de productos de la venta</span>
                  <Cambio antes={vista.costoVentaAntes} despues={vista.costoVentaDespues} />
                </p>
                <p className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-muted-foreground">Ganancia de la venta</span>
                  <Cambio antes={vista.gananciaAntes} despues={vista.gananciaDespues} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {vista.gananciaAntes === vista.gananciaDespues
                    ? "La ganancia y la comisión quedan iguales."
                    : "Ojo: el costo cambia, así que la ganancia y la comisión de esta venta se recalculan."}
                </p>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Volver
              </Button>
              <GuardarBoton disabled={!listo} aStock={aStock} />
            </DialogFooter>
          </form>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function costosDe(opciones: OpcionesCambio, supplierId: string): Record<string, string> {
  const ficha = opciones.proveedoras.find((p) => p.id === supplierId)?.costos ?? {};
  return Object.fromEntries(
    opciones.piezas.map((p) => [p.id, String(Math.round(ficha[p.id] ?? p.costoActual))]),
  );
}
