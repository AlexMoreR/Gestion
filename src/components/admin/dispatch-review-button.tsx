"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, MapPin, Package, Truck } from "lucide-react";
import { adminUpdateDispatchShippingCostsAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { getDispatchStatusBadgeClassName, getDispatchStatusLabel } from "@/lib/orders";

export type DispatchReviewData = {
  id: string;
  code: string;
  orderCode: string;
  clientName: string;
  carrierName: string | null;
  trackingNumber: string | null;
  status: "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED";
  deliveryType: "COUNTER" | "PICKUP" | "SHIPPING";
  shippingCost: number | null;
  shippingAddress: string | null;
  notes: string | null;
  createdAt: string;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  shippingReceiptUrl: string | null;
  items: { id: string; name: string; code: string | null; quantity: number; shippingCost: number }[];
};

const DELIVERY_TYPE_LABEL: Record<DispatchReviewData["deliveryType"], string> = {
  COUNTER: "Mostrador",
  PICKUP: "Recoge en tienda",
  SHIPPING: "Envío",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function DispatchReviewButton({
  dispatch,
  currency,
}: {
  dispatch: DispatchReviewData;
  currency: SupportedCurrencyCode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const total = dispatch.shippingCost ?? 0;

  // Valores iniciales: si ya hay costos por item guardados se usan; si no, se
  // reparte el total proporcional a la cantidad para dar un punto de partida.
  const initialCosts = useMemo(() => {
    const stored = dispatch.items.reduce((sum, item) => sum + item.shippingCost, 0);
    if (stored > 0) {
      return Object.fromEntries(dispatch.items.map((item) => [item.id, String(Math.round(item.shippingCost))]));
    }
    const totalQty = dispatch.items.reduce((sum, item) => sum + item.quantity, 0);
    let assigned = 0;
    const entries = dispatch.items.map((item, index) => {
      const share =
        totalQty === 0
          ? 0
          : index === dispatch.items.length - 1
            ? total - assigned
            : Math.round((total * item.quantity) / totalQty);
      assigned += share;
      return [item.id, String(Math.max(0, share))] as const;
    });
    return Object.fromEntries(entries);
  }, [dispatch.items, total]);

  const [costs, setCosts] = useState<Record<string, string>>(initialCosts);

  const assigned = dispatch.items.reduce((sum, item) => sum + (Number(costs[item.id]) || 0), 0);
  const matchesTotal = Math.abs(assigned - total) <= 1;

  const save = async () => {
    setSaving(true);
    setError("");
    const result = await adminUpdateDispatchShippingCostsAction({
      dispatchId: dispatch.id,
      items: dispatch.items.map((item) => ({ id: item.id, shippingCost: Number(costs[item.id]) || 0 })),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar");
      return;
    }
    router.refresh();
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setOpen(true)}>
        <Eye className="mr-1.5 h-3.5 w-3.5" />
        Ver
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              Despacho {dispatch.code}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getDispatchStatusBadgeClassName(dispatch.status)}`}
              >
                {getDispatchStatusLabel(dispatch.status)}
              </span>
              <span className="text-xs text-muted-foreground">Orden {dispatch.orderCode}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Cliente" value={dispatch.clientName} />
              <Field label="Tipo de entrega" value={DELIVERY_TYPE_LABEL[dispatch.deliveryType]} />
              <Field label="Transportadora" value={dispatch.carrierName ?? "—"} />
              <Field label="Guía" value={dispatch.trackingNumber ?? "—"} />
            </div>

            {/* Costo de envío: dinero que se le paga a la transportadora (proveedor). */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Costo de envío (a pagar)
              </span>
              <span className="text-sm font-semibold text-foreground">
                {dispatch.shippingCost === null ? "—" : formatMoney(dispatch.shippingCost, currency)}
              </span>
            </div>

            {dispatch.shippingAddress ? (
              <Field
                label="Dirección"
                value={
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {dispatch.shippingAddress}
                  </span>
                }
              />
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Productos ({dispatch.items.length})
                </p>
                <p className="text-xs text-muted-foreground">Costo de envío por producto</p>
              </div>
              {dispatch.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  Sin items en este despacho.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {dispatch.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.code ? `${item.code} · ` : ""}x{item.quantity}
                        </p>
                      </div>
                      <MoneyInput
                        value={costs[item.id] ?? "0"}
                        onValueChange={(raw) => setCosts((current) => ({ ...current, [item.id]: raw }))}
                      />
                    </div>
                  ))}

                  <div
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      matchesTotal
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    <span className="font-medium text-foreground">
                      Asignado {formatMoney(assigned, currency)} / {formatMoney(total, currency)}
                    </span>
                    {!matchesTotal ? (
                      <span className="text-xs font-medium text-amber-600">
                        Diferencia {formatMoney(Math.abs(assigned - total), currency)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-600">Cuadra ✓</span>
                    )}
                  </div>

                  {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

                  <Button type="button" onClick={save} disabled={saving || !matchesTotal} className="w-full">
                    {saving ? "Guardando..." : "Guardar reparto"}
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Creado" value={dispatch.createdAt} />
              <Field label="Despachado" value={dispatch.shippedAt ?? "—"} />
              <Field label="Entregado" value={dispatch.deliveredAt ?? "—"} />
            </div>

            {dispatch.notes ? <Field label="Notas" value={dispatch.notes} /> : null}

            {dispatch.shippingReceiptUrl ? (
              <a
                href={dispatch.shippingReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Eye className="h-4 w-4" />
                Ver comprobante de envío
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
