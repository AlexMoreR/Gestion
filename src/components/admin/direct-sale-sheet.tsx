"use client";

import * as React from "react";
import { Plus, PlusCircle, Search, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { adminCreateDirectSaleAction } from "@/app/actions/sales-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

export type DirectSaleProduct = {
  id: string;
  name: string;
  code: string | null;
  retailPrice: number;
  thumbnailUrl?: string | null;
};

type DraftLine = {
  uid: string;
  productId: string;
  name: string;
  code: string | null;
  quantity: number;
  unitPrice: number;
  description: string;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <PlusCircle className="h-4 w-4" />
      {pending ? "Creando venta..." : "Crear venta"}
    </Button>
  );
}

export function DirectSaleSheet({
  products,
  currency,
}: {
  products: DirectSaleProduct[];
  currency: SupportedCurrencyCode;
}) {
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<DraftLine[]>([]);
  const [search, setSearch] = React.useState("");
  const [withPayment, setWithPayment] = React.useState(false);

  const matches = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 6);
    return products
      .filter((p) => `${p.code ?? ""} ${p.name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const total = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines],
  );

  function addProduct(product: DirectSaleProduct) {
    setLines((prev) => [
      ...prev,
      {
        uid: `${product.id}-${prev.length}-${Math.round(total)}`,
        productId: product.id,
        name: product.name,
        code: product.code,
        quantity: 1,
        unitPrice: product.retailPrice,
        description: "",
      },
    ]);
    setSearch("");
  }

  function updateLine(uid: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.uid === uid ? { ...line, ...patch } : line)));
  }

  function removeLine(uid: string) {
    setLines((prev) => prev.filter((line) => line.uid !== uid));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants()}>
        <Plus className="h-4 w-4" />
        Venta directa
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Nueva venta directa</SheetTitle>
          <SheetDescription>
            Venta de mostrador sin cotización previa. Agrega los productos y, si quieres, el pago.
          </SheetDescription>
        </SheetHeader>

        <form
          action={adminCreateDirectSaleAction}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-3"
        >
          <input type="hidden" name="returnTo" value="/admin/ventas" />

          {/* Cliente */}
          <div className="space-y-1.5">
            <label htmlFor="direct-client-name" className="text-sm font-medium text-foreground">
              Cliente
            </label>
            <input
              id="direct-client-name"
              name="clientName"
              type="text"
              className={inputClass}
              placeholder="Consumidor final"
            />
            <p className="text-xs text-muted-foreground">Opcional. Si lo dejas vacío se usa “Consumidor final”.</p>
          </div>

          {/* Buscar / agregar productos */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Productos</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Buscar por nombre o código…"
              />
            </div>
            {search.trim() || matches.length > 0 ? (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                {matches.length > 0 ? (
                  matches.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{product.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{product.code || "Sin código"}</span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {formatMoney(product.retailPrice, currency)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Sin coincidencias.</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Lineas agregadas */}
          <div className="space-y-2">
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Aún no agregaste productos.
              </div>
            ) : (
              lines.map((line) => (
                <div key={line.uid} className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{line.code || "Sin código"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.uid)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Quitar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.uid, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Precio unitario</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.uid, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Descripción (opcional)</label>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(event) => updateLine(line.uid, { description: event.target.value })}
                      className={inputClass}
                      placeholder="Color, detalle, etc."
                    />
                  </div>
                  <p className="text-right text-sm font-semibold text-foreground">
                    {formatMoney(line.quantity * line.unitPrice, currency)}
                  </p>

                  {/* Campos enviados al servidor */}
                  <input type="hidden" name="itemProductIds" value={line.productId} />
                  <input type="hidden" name="itemQuantities" value={line.quantity} />
                  <input type="hidden" name="itemUnitPrices" value={line.unitPrice} />
                  <input type="hidden" name="itemDescriptions" value={line.description} />
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-4 py-3">
            <span className="text-sm font-bold uppercase text-slate-900">Total</span>
            <span className="text-lg font-black text-slate-900">{formatMoney(total, currency)}</span>
          </div>

          {/* Pago opcional */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={withPayment}
                onChange={(event) => setWithPayment(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Registrar un abono ahora
            </label>

            {withPayment ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="direct-amount" className="text-sm text-foreground">Monto del abono</label>
                  <input
                    id="direct-amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    max={total || undefined}
                    step="0.01"
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="direct-method" className="text-sm text-foreground">Medio de pago</label>
                  <select id="direct-method" name="paymentMethod" defaultValue="EFECTIVO" className={inputClass}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="direct-receipt" className="text-sm text-foreground">Comprobante</label>
                  <input
                    id="direct-receipt"
                    name="receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground">Obligatorio si el pago no es en efectivo.</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="direct-note" className="text-sm text-foreground">Nota (opcional)</label>
                  <input id="direct-note" name="note" type="text" className={inputClass} />
                </div>
              </div>
            ) : null}
          </div>

          <CreateButton />
          {lines.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">Agrega al menos un producto para crear la venta.</p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
