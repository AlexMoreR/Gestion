"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { PackagePlus, Undo2 } from "lucide-react";
import {
  adminAnnulSaleRefundAction,
  adminPassCancelledItemToStockAction,
  adminRegisterSaleRefundAction,
} from "@/app/actions/cancelled-sale-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVO_RETROACTIVO_FIELD, MOTIVO_VENTA_ANULADA_MAX, MOTIVO_VENTA_ANULADA_MIN } from "@/lib/cancelled-sale";

export type CancelledSaleCardProps = {
  saleId: string;
  returnTo: string;
  /** AAAA-MM-DD de hoy en Colombia (fecha por defecto y tope de la devolución). */
  today: string;
  pagado: number;
  devuelto: number;
  faltaDevolver: number;
  productos: { orderItemId: string; nombre: string; cantidad: number; costo: number; proveedora: string | null; yaPaso: boolean }[];
  devoluciones: { id: string; fecha: string; monto: number; cuenta: string; nota: string | null }[];
  accounts: { id: string; name: string }[];
};

const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;
const LABEL = "text-xs uppercase tracking-[0.2em] text-muted-foreground";
const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Guardando..." : children}
    </Button>
  );
}

function Motivo({ placeholder }: { placeholder: string }) {
  return (
    <div className="space-y-1">
      <label className={LABEL} htmlFor="venta-anulada-motivo">
        Motivo
      </label>
      <Textarea
        id="venta-anulada-motivo"
        name="motivo"
        required
        minLength={MOTIVO_VENTA_ANULADA_MIN}
        maxLength={MOTIVO_VENTA_ANULADA_MAX}
        rows={3}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Botón que abre una ventana con un formulario que solo pide el motivo. */
function MotivoDialog({
  boton,
  titulo,
  descripcion,
  accion,
  campos,
  returnTo,
  placeholder,
  confirmar,
  variant = "outline",
}: {
  boton: React.ReactNode;
  titulo: string;
  descripcion: string;
  accion: (formData: FormData) => Promise<void>;
  campos: Record<string, string>;
  returnTo: string;
  placeholder: string;
  confirmar: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>
        {boton}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <form action={accion} className="space-y-3">
            {Object.entries(campos).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="returnTo" value={returnTo} />
            <Motivo placeholder={placeholder} />
            <Enviar>{confirmar}</Enviar>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DevolucionDialog(props: CancelledSaleCardProps) {
  const [open, setOpen] = React.useState(false);
  const [monto, setMonto] = React.useState("");
  const [fecha, setFecha] = React.useState(props.today);
  const atrasada = fecha !== "" && fecha < props.today;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={props.faltaDevolver <= 0}>
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        Registrar devolución de dinero
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Devolución de dinero a la clienta</DialogTitle>
            <DialogDescription>
              Sale de la cuenta que elijas. Falta devolver {pesos(props.faltaDevolver)}; no se puede pasar de eso.
            </DialogDescription>
          </DialogHeader>
          <form action={adminRegisterSaleRefundAction} className="space-y-3">
            <input type="hidden" name="saleId" value={props.saleId} />
            <input type="hidden" name="returnTo" value={props.returnTo} />
            <div className="space-y-1">
              <label className={LABEL} htmlFor="devolucion-cuenta">
                Cuenta
              </label>
              <select id="devolucion-cuenta" name="accountId" required defaultValue="" className={SELECT}>
                <option value="" disabled>
                  Elige la cuenta
                </option>
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL} htmlFor="devolucion-monto">
                  Monto
                </label>
                <MoneyInput id="devolucion-monto" name="monto" value={monto} onValueChange={setMonto} />
              </div>
              <div className="space-y-1">
                <label className={LABEL} htmlFor="devolucion-fecha">
                  Fecha
                </label>
                <Input
                  id="devolucion-fecha"
                  name="fecha"
                  type="date"
                  required
                  max={props.today}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
            </div>
            <Motivo placeholder="Ej.: no recibió los productos, se le devuelve la mitad" />
            {atrasada ? (
              <div className="space-y-1">
                <label className={LABEL} htmlFor="devolucion-retro">
                  La fecha es anterior a hoy: ¿por qué se registra tarde?
                </label>
                <Textarea id="devolucion-retro" name={MOTIVO_RETROACTIVO_FIELD} required minLength={5} maxLength={500} rows={2} />
              </div>
            ) : null}
            <Enviar>Registrar devolución</Enviar>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Orden de una venta anulada: pasar sus productos de Fabricación a inventario (sin deuda nueva) y devolver la plata.
export function CancelledSaleCard(props: CancelledSaleCardProps) {
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Venta anulada: productos y devolución</h2>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Pasar a inventario no crea ni borra deuda con la proveedora. Hazlo solo cuando el producto esté en bodega.
          </p>
          {props.productos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Esta venta no tiene productos de Fabricación.</p>
          ) : (
            <ul className="space-y-2">
              {props.productos.map((p) => (
                <li key={p.orderItemId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
                  <div className="min-w-0">
                    <p className="break-words text-sm text-foreground">
                      {p.cantidad} × {p.nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.proveedora ?? "Sin proveedora"} · costo {pesos(p.costo)}
                    </p>
                  </div>
                  {p.yaPaso ? (
                    <Badge variant="outline">En inventario</Badge>
                  ) : (
                    <MotivoDialog
                      boton="Pasar a inventario"
                      titulo={`Pasar a inventario: ${p.nombre}`}
                      descripcion={`Suma ${p.cantidad} al inventario con costo ${pesos(p.costo)}. La deuda con ${
                        p.proveedora ?? "la proveedora"
                      } no cambia. Solo se puede hacer una vez.`}
                      accion={adminPassCancelledItemToStockAction}
                      campos={{ orderItemId: p.orderItemId }}
                      returnTo={props.returnTo}
                      placeholder="Ej.: llegó a bodega en Cali, queda para vender"
                      confirmar="Pasar a inventario"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              Pagado {pesos(props.pagado)} · Devuelto {pesos(props.devuelto)} · Falta devolver {pesos(props.faltaDevolver)}
            </p>
            <DevolucionDialog {...props} />
          </div>
          {props.devoluciones.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no hay devoluciones registradas.</p>
          ) : (
            <ul className="space-y-2">
              {props.devoluciones.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {pesos(d.monto)} · {d.cuenta} · {d.fecha}
                    </p>
                    {d.nota ? <p className="break-words text-xs text-muted-foreground">{d.nota}</p> : null}
                  </div>
                  <MotivoDialog
                    boton="Anular"
                    variant="ghost"
                    titulo="Anular devolución"
                    descripcion={`Vuelve a sumar ${pesos(d.monto)} a ${d.cuenta}. Queda copia en Anulados.`}
                    accion={adminAnnulSaleRefundAction}
                    campos={{ movementId: d.id }}
                    returnTo={props.returnTo}
                    placeholder="Ej.: el monto quedó mal escrito"
                    confirmar="Anular devolución"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
