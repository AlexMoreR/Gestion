"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Factory, MessageCircle } from "lucide-react";
import { adminUpdateManufacturingOrderAction } from "@/app/actions/manufacturing-order-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

export type ManufacturingCard = {
  id: string;
  code: string;
  supplierName: string;
  // Solo digitos, listo para wa.me (puede venir vacio).
  supplierWhatsApp: string;
  url: string;
  deliveryDate: string; // yyyy-MM-dd o ""
  deliveryAddress: string;
  notes: string;
  totalCost: number;
  hasMissingCost: boolean;
  units: number;
  lines: Array<{ id: string; name: string; code: string | null; quantity: number }>;
};

type OrderManufacturingTabProps = {
  cards: ManufacturingCard[];
  currency: SupportedCurrencyCode;
  returnTo: string;
  brandName: string;
};

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copia el enlace:", url);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar enlace"}
    </Button>
  );
}

export function OrderManufacturingTab({ cards, currency, returnTo, brandName }: OrderManufacturingTabProps) {
  if (cards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        Aún no hay productos asignados a una proveedora. Usa <span className="font-medium">Fabricar</span> en
        cada producto y aquí aparecerá la orden de fabricación de cada proveedora.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        const message = `Hola ${card.supplierName}, te compartimos la orden de fabricación *${card.code}* de ${brandName}:\n${card.url}`;
        const waHref = `https://wa.me/${card.supplierWhatsApp}?text=${encodeURIComponent(message)}`;

        return (
          <div key={card.id} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Factory className="h-4 w-4 text-muted-foreground" /> {card.code}
                </p>
                <p className="truncate text-xs text-muted-foreground">{card.supplierName}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatMoney(card.totalCost, currency)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {card.units} und · {card.lines.length} producto{card.lines.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {card.lines.map((line) => (
                <li key={line.id} className="truncate">
                  {line.quantity} × {line.name}
                  {line.code ? <span className="text-muted-foreground/70"> · {line.code}</span> : null}
                </li>
              ))}
            </ul>

            {card.hasMissingCost ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Hay productos sin costo confirmado; el total puede estar incompleto.
              </p>
            ) : null}

            <form action={adminUpdateManufacturingOrderAction} className="space-y-2">
              <input type="hidden" name="manufacturingOrderId" value={card.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="grid gap-2 sm:grid-cols-[9.5rem_1fr]">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Fecha de entrega</span>
                  <Input type="date" name="deliveryDate" defaultValue={card.deliveryDate} className="h-8 text-xs" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Dirección de despacho</span>
                  <Input
                    name="deliveryAddress"
                    defaultValue={card.deliveryAddress}
                    placeholder="A dónde debe entregar"
                    className="h-8 text-xs"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Notas para la proveedora</span>
                <textarea
                  name="notes"
                  defaultValue={card.notes}
                  rows={2}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </label>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" size="sm" className="h-8 text-xs">
                  Guardar datos de entrega
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver
              </a>
              <CopyLinkButton url={card.url} />
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
