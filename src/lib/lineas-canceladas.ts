// Productos cancelados de una venta (nov-2026): se leen de las copias en RegistroAnulado que deja
// adminCancelSaleItemAction (tabla QuoteItem con el código de la venta; OrderItem con el de la orden).
// Puro: agrupa las piezas de un combo en una sola fila por cancelación.
import { parseQuoteItemMeta } from "./quote-item-meta";

export type LineaCancelada = { producto: string; cantidad: number; total: number; motivo: string; fecha: Date };

type Copia = { datos: unknown; motivo: string; anuladoEn: Date; monto: unknown };

export function agruparCanceladas(copias: Copia[]): LineaCancelada[] {
  const grupos = new Map<string, LineaCancelada>();
  for (const copia of copias) {
    const fila = (copia.datos ?? {}) as Record<string, unknown>;
    const meta = parseQuoteItemMeta(typeof fila.notes === "string" ? fila.notes : null);
    const nombre = typeof fila.productName === "string" ? fila.productName : "Producto";
    const cantidad = Number(fila.quantity) || 0;
    const combo = meta.comboKey || "";
    // Una cancelación de un combo deja varias copias en el mismo instante y con el mismo motivo.
    const clave = `${copia.anuladoEn.getTime()}|${copia.motivo}|${combo || String(fila.id)}`;
    const actual = grupos.get(clave);
    if (actual) {
      actual.total += Number(copia.monto) || 0;
      continue;
    }
    grupos.set(clave, {
      producto: combo ? meta.comboName || nombre : nombre,
      cantidad: combo ? meta.comboQuantity || cantidad : cantidad,
      total: Number(copia.monto) || 0,
      // El motivo guardado es "Canceló <producto> de ORD-…: <motivo>"; se muestra solo lo que escribió la persona.
      motivo: copia.motivo.replace(/^Canceló .*? de [A-Z]+-\d+: /, ""),
      fecha: copia.anuladoEn,
    });
  }
  return [...grupos.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
