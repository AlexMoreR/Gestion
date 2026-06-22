// Convierte los items de una cotizacion en items de orden, expandiendo los
// combos (productos isBundle) en una linea por cada componente. Asi la orden de
// fabricacion muestra los subproductos reales y no el combo "padre".
//
// La expansion ocurre del lado del servidor al crear la orden, como red de
// seguridad: aunque un combo llegue sin expandir desde la cotizacion/venta, la
// orden siempre recibe sus componentes con su propio proveedor, fabricacion y pago.

import type { ProductFulfillmentMode } from "@prisma/client";
import { expandComboLines } from "./combo";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

export type QuoteItemForExpansion = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // El modo de cumplimiento se decide en la linea de venta, no en el producto.
  fulfillmentMode: ProductFulfillmentMode;
  notes: string | null;
  product: {
    name: string;
    isBundle: boolean;
    bundleComponents: Array<{
      quantity: number;
      child: {
        id: string;
        name: string;
        code: string | null;
        price: number;
      };
    }>;
  };
};

export type OrderItemInput = {
  quoteItemId: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillmentMode: ProductFulfillmentMode;
  notes: string | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function expandQuoteItemToOrderItems(item: QuoteItemForExpansion): OrderItemInput[] {
  if (item.product.isBundle && item.product.bundleComponents.length > 0) {
    const expanded = expandComboLines(
      item.product.bundleComponents.map((component) => ({
        productId: component.child.id,
        name: component.child.name,
        code: component.child.code,
        quantity: component.quantity,
        retailPrice: component.child.price,
      })),
      item.quantity,
      item.unitPrice,
    );

    if (expanded.length > 0) {
      const baseMeta = parseQuoteItemMeta(item.notes);
      const comboLabel = `Combo: ${item.product.name}`;

      return expanded.map((line) => ({
        // Un combo se expande en varias lineas: no se puede conservar el
        // quoteItemId (es unico), por eso se deja en null en los componentes.
        quoteItemId: null,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: round2(line.unitPrice * line.quantity),
        // Todos los componentes heredan el modo elegido en la linea del combo.
        fulfillmentMode: item.fulfillmentMode,
        notes: stringifyQuoteItemMeta({
          description: baseMeta.description ? `${baseMeta.description} - ${comboLabel}` : comboLabel,
          color: baseMeta.color,
        }),
      }));
    }
  }

  return [
    {
      quoteItemId: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      fulfillmentMode: item.fulfillmentMode,
      notes: item.notes,
    },
  ];
}

export function expandQuoteItemsToOrderItems(items: QuoteItemForExpansion[]): OrderItemInput[] {
  return items.flatMap(expandQuoteItemToOrderItems);
}
