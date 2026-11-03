"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import {
  LOT_LOCATIONS,
  LOT_LOCATION_LABELS,
  lotUnitLabel,
  summarizeLotUnits,
  type LotAction,
} from "@/modules/inventory/domain/purchase-lot";
import {
  lotArrivedAction,
  lotChangeLocationAction,
  lotEditColorAction,
  lotSoldAction,
  lotStartManufacturingAction,
} from "@/app/actions/purchase-lot-actions";

export type PurchaseLotUnit = {
  id: string;
  estado: string;
  ubicacion: string | null;
  color: string | null;
  saleOrderCode: string | null;
};

export type PurchaseLot = {
  key: string;
  orderId: string;
  code: string;
  orderCode: string;
  supplierName: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  paid: number;
  pending: number;
  units: PurchaseLotUnit[];
};

export type SaleOrderOption = { id: string; label: string; productIds: string[] };

type DialogState = { accion: LotAction; unit: PurchaseLotUnit; lot: PurchaseLot } | null;

const ACTIONS: Record<LotAction, { label: string; title: string; submit: string; run: (formData: FormData) => Promise<void> }> = {
  fabricar: { label: "Pasar a fabricar", title: "Pasar a fabricar", submit: "Pasar a fabricar", run: lotStartManufacturingAction },
  llego: { label: "Llegó", title: "Llegó la unidad", submit: "Guardar llegada", run: lotArrivedAction },
  ubicacion: { label: "Cambiar ubicación", title: "Cambiar ubicación", submit: "Guardar ubicación", run: lotChangeLocationAction },
  color: { label: "Editar color", title: "Editar color", submit: "Guardar color", run: lotEditColorAction },
  vendida: { label: "Salió en venta", title: "Salió en venta", submit: "Marcar como vendida", run: lotSoldAction },
};

// Qué botones valen en cada estado (las mismas reglas que validateLotTransition).
const ACTIONS_BY_STATE: Record<string, LotAction[]> = {
  PENDIENTE: ["fabricar"],
  FABRICANDO: ["llego", "color"],
  EN_INVENTARIO: ["ubicacion", "color", "vendida"],
};

export function PurchaseLotsView({
  lots,
  saleOrders,
  currency,
  canEdit,
}: {
  lots: PurchaseLot[];
  saleOrders: SaleOrderOption[];
  currency: SupportedCurrencyCode;
  canEdit: boolean;
}) {
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const resumen = summarizeLotUnits(lots.flatMap((lot) => lot.units));
  const money = (value: number) => formatMoney(value, currency);

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-foreground">Lotes de compra</h1>
          <Button variant="outline" size="sm" render={<Link href="/admin/inventario" />}>
            <ArrowLeft className="h-4 w-4" />
            Inventario
          </Button>
        </div>

        <Card className="rounded-2xl px-4 py-3 text-sm font-medium text-foreground">
          Cali: {resumen.cali} · Taller proveedora: {resumen.taller} · Fabricando: {resumen.fabricando} · Pendientes:{" "}
          {resumen.pendientes}
        </Card>

        {lots.length === 0 ? (
          <Card className="rounded-2xl p-5 text-sm text-muted-foreground">
            Todavía no hay compras por lote. Se crean en Registrar compra con &quot;Pendientes por fabricar&quot;.
          </Card>
        ) : null}

        {lots.map((lot) => (
          <Card key={lot.key} className="space-y-3 rounded-2xl p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/ordenes/${lot.orderId}`} className="text-sm font-semibold text-primary hover:underline">
                  {lot.code}
                </Link>
                <span className="text-xs text-muted-foreground">{lot.orderCode}</span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {lot.productName} · {lot.supplierName}
              </p>
              <p className="text-xs text-muted-foreground">
                {lot.quantity} × {money(lot.unitCost)} = {money(lot.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                Pagado {money(lot.paid)} · Saldo {money(lot.pending)}
              </p>
            </div>

            <ul className="divide-y divide-border rounded-xl border border-border">
              {lot.units.map((unit, index) => (
                <li key={unit.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <Badge variant={unit.estado === "EN_INVENTARIO" ? "default" : "secondary"}>{lotUnitLabel(unit)}</Badge>
                    {unit.saleOrderCode ? <span className="text-xs text-muted-foreground">{unit.saleOrderCode}</span> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(ACTIONS_BY_STATE[unit.estado] ?? []).map((accion) => (
                        <Button
                          key={accion}
                          type="button"
                          size="sm"
                          variant={accion === "fabricar" || accion === "llego" ? "default" : "outline"}
                          onClick={() => setDialog({ accion, unit, lot })}
                        >
                          {ACTIONS[accion].label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      {dialog ? <LotActionDialog state={dialog} saleOrders={saleOrders} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function LotActionDialog({
  state,
  saleOrders,
  onClose,
}: {
  state: NonNullable<DialogState>;
  saleOrders: SaleOrderOption[];
  onClose: () => void;
}) {
  const { accion, unit, lot } = state;
  const config = ACTIONS[accion];
  // Primero las órdenes que traen este producto.
  const orderedSales = React.useMemo(
    () =>
      [...saleOrders].sort(
        (a, b) => Number(b.productIds.includes(lot.productId)) - Number(a.productIds.includes(lot.productId)),
      ),
    [saleOrders, lot.productId],
  );

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
      onClick={onClose}
    >
      <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{config.title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lot.productName} · {lotUnitLabel(unit)}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          action={config.run}
          // Se cierra después de enviar, para que el aviso (?ok= / ?error=) quede a la vista.
          onSubmit={() => setTimeout(onClose)}
          className="space-y-4 px-4 py-4"
        >
          <input type="hidden" name="unitId" value={unit.id} />

          {accion === "fabricar" || accion === "color" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Color</span>
              <Input name="color" required maxLength={60} defaultValue={unit.color ?? ""} placeholder="Ej.: Negro" />
            </label>
          ) : null}

          {accion === "llego" || accion === "ubicacion" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Ubicación</span>
              <select name="ubicacion" required defaultValue="" className="field-select">
                <option value="" disabled>
                  Elige dónde quedó
                </option>
                {LOT_LOCATIONS.filter((loc) => accion === "llego" || loc !== unit.ubicacion).map((loc) => (
                  <option key={loc} value={loc}>
                    {LOT_LOCATION_LABELS[loc]}
                  </option>
                ))}
              </select>
              {accion === "llego" ? (
                <span className="text-xs text-muted-foreground">Suma 1 al stock. No cambia la deuda con la proveedora.</span>
              ) : null}
            </label>
          ) : null}

          {accion === "vendida" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Orden de venta</span>
              {orderedSales.length === 0 ? (
                <span className="block text-xs text-muted-foreground">No hay órdenes de venta abiertas.</span>
              ) : (
                <select name="saleOrderId" required defaultValue="" className="field-select">
                  <option value="" disabled>
                    Elige la orden
                  </option>
                  {orderedSales.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.label}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs text-muted-foreground">
                Solo marca la unidad. El stock baja al confirmar la pieza en la orden (modo Stock).
              </span>
            </label>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={accion === "vendida" && orderedSales.length === 0}>
              {config.submit}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
