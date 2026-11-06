"use client";

import type { ReactNode } from "react";
import { Boxes, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { imageVariantUrl } from "@/lib/image-variants";

type FulfillmentMode = "STOCK" | "MANUFACTURE";

// Badge del tipo de cumplimiento (solo lectura) para la revision.
export function FulfillmentBadge({ mode }: { mode: FulfillmentMode; canStock?: boolean }) {
  const isStock = mode === "STOCK";
  const label = isStock ? "Stock" : "Fabricacion";
  const tone = isStock
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

type QuoteLineCardProps = {
  name: string;
  code: string;
  imageUrl?: string;
  isCombo?: boolean;
  fulfillmentMode: FulfillmentMode;
  description: string;
  color: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  onEdit?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  // Selector de colores por parte, debajo de la tarjeta.
  children?: ReactNode;
};

// Linea de la cotizacion como tarjeta (celular y tableta, donde la tabla no cabe).
export function QuoteLineCard({
  name,
  code,
  imageUrl,
  isCombo,
  fulfillmentMode,
  description,
  color,
  quantity,
  unitPrice,
  total,
  currency,
  onEdit,
  onRemove,
  removeLabel = "Quitar producto",
  children,
}: QuoteLineCardProps) {
  const money = (value: number) => value.toLocaleString("es-CO", { style: "currency", currency });

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        {imageUrl ? (
          <img
            src={imageVariantUrl(imageUrl, "thumb")}
            alt={name}
            className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
            {isCombo ? <Boxes className="h-4 w-4 text-primary" /> : "Sin img"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-foreground">{name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="break-all text-xs text-muted-foreground">{code || "Sin codigo"}</span>
            <FulfillmentBadge mode={fulfillmentMode} />
          </div>
          {description ? <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {onEdit || onRemove ? (
          <div className="flex shrink-0 gap-1.5">
            {onEdit ? (
              <Button type="button" variant="outline" size="icon" className="size-11" onClick={onEdit} aria-label="Editar" title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {onRemove ? (
              <Button type="button" variant="destructive" size="icon" className="size-11" onClick={onRemove} aria-label={removeLabel}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-muted-foreground">Color</dt>
          <dd className="break-words text-foreground">{color || "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cantidad</dt>
          <dd className="text-foreground">{quantity}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Precio</dt>
          <dd className="break-words text-foreground">{money(unitPrice)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="break-words font-semibold text-foreground">{money(total)}</dd>
        </div>
      </dl>

      {children ? <div className="mt-3 border-t border-border pt-3">{children}</div> : null}
    </div>
  );
}
