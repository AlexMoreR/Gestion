// «Agregar adicional» a un producto de una venta ya creada (nov-2026; ej. base cromada +50.000).
// Aquí solo reglas puras: validar, bloqueos, la nota nueva de la línea y qué línea recibe el adicional.
// La escritura está en sale-item-extra.server.ts.
import { linesToRecolor, type LineaCotizacion, type LineaOrden } from "./color-change";
import { parseQuoteItemMeta, type AdicionalLinea, type QuoteItemMeta } from "./quote-item-meta";

export const ADICIONAL_DESCRIPCION_MIN = 2;
export const ADICIONAL_DESCRIPCION_MAX = 80;
export const ADICIONAL_PRECIO_MAX = 20_000_000;

type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export type AdicionalNuevo = { descripcion: string; precio: number; costo: number };

const redondear = (valor: number) => Math.round(valor * 100) / 100;

export function validarAdicional(input: { descripcion: unknown; precio: unknown; costo?: unknown }): Resultado<AdicionalNuevo> {
  const descripcion = typeof input.descripcion === "string" ? input.descripcion.trim() : "";
  if (descripcion.length < ADICIONAL_DESCRIPCION_MIN || descripcion.length > ADICIONAL_DESCRIPCION_MAX) {
    return { ok: false, error: `Escribe qué es el adicional (de ${ADICIONAL_DESCRIPCION_MIN} a ${ADICIONAL_DESCRIPCION_MAX} letras).` };
  }
  const precio = Number(input.precio);
  if (!Number.isFinite(precio) || precio <= 0 || precio > ADICIONAL_PRECIO_MAX) {
    return { ok: false, error: "El precio del adicional debe ser mayor a 0 y hasta $20.000.000." };
  }
  const costoCrudo = input.costo === undefined || input.costo === null || input.costo === "" ? 0 : Number(input.costo);
  if (!Number.isFinite(costoCrudo) || costoCrudo < 0 || costoCrudo > ADICIONAL_PRECIO_MAX) {
    return { ok: false, error: "El costo del adicional no es válido." };
  }
  return { ok: true, value: { descripcion, precio: redondear(precio), costo: redondear(costoCrudo) } };
}

/** Por qué no se puede sumar el adicional (null = se puede). */
export function bloqueoAdicional(input: {
  saleStatus: string | null;
  itemCancelado: boolean;
  costo: number;
  fulfillmentMode: string;
  confirmedSupplierId: string | null;
}): string | null {
  if (!input.saleStatus) return "Solo se agregan adicionales a un producto de una venta.";
  if (input.saleStatus === "CANCELLED") return "La venta está cancelada: no se le pueden agregar adicionales.";
  if (input.itemCancelado) return "Ese producto fue cancelado: no se le pueden agregar adicionales.";
  if (input.costo > 0 && (input.fulfillmentMode !== "MANUFACTURE" || !input.confirmedSupplierId)) {
    return "El costo del adicional solo se carga a un producto de fabricación con proveedora confirmada. Déjalo en 0.";
  }
  return null;
}

/** El meta nuevo: el precio se suma a additionalCost (así sube el total de la línea) y queda en la lista. */
export function aplicarAdicional(meta: QuoteItemMeta, adicional: AdicionalLinea): QuoteItemMeta {
  return {
    ...meta,
    additionalCost: redondear(meta.additionalCost + adicional.precio),
    adicionales: [...meta.adicionales, adicional],
  };
}

export function adicionalesDeLinea(notes: string | null | undefined): AdicionalLinea[] {
  return parseQuoteItemMeta(notes).adicionales;
}

/**
 * Qué línea recibe el adicional: con el mismo criterio de linesToRecolor (un combo, todas sus piezas) se
 * toma la primera pieza: la primera línea del grupo en la cotización y, en la orden, la ligada a ella o, si
 * no hay (combo sin desglosar), la primera pieza del grupo. null = el producto no está en la orden.
 */
export function lineasDelAdicional<Q extends LineaCotizacion, O extends LineaOrden>(
  orderItemId: string,
  quoteItems: Q[],
  orderItems: O[],
): { quoteItem: Q | null; orderItem: O } | null {
  const lines = linesToRecolor(orderItemId, quoteItems, orderItems);
  if (!lines) return null;
  const quoteItem = quoteItems.find((q) => lines.quoteItemIds.includes(q.id)) ?? null;
  const grupo = orderItems.filter((o) => lines.orderItemIds.includes(o.id));
  const orderItem = (quoteItem && grupo.find((o) => o.quoteItemId === quoteItem.id)) || grupo[0];
  return orderItem ? { quoteItem, orderItem } : null;
}
