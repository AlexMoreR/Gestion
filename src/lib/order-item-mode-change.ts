// Cambiar Fabricación ↔ Stock un producto YA confirmado (aunque esté entregado), desde "Editar orden"
// (nov-2026, T-846). Reglas puras: cuándo se deja y el antes/después que se muestra antes de guardar.
// La lectura y la escritura están en order-item-mode-change.server.ts. No toca la venta, los abonos, la
// entrega ni el despacho: solo el cargo a la proveedora, el inventario y el costo de las piezas.

export type DireccionCambio = "A_STOCK" | "A_FABRICACION";

/** Solo lo confirmado usa este cambio; lo no confirmado se cambia con el selector de siempre. */
export function direccionDeCambio(item: { fulfillmentMode: string; confirmedAt: Date | string | null }): DireccionCambio | null {
  if (!item.confirmedAt) return null;
  if (item.fulfillmentMode === "MANUFACTURE") return "A_STOCK";
  if (item.fulfillmentMode === "STOCK") return "A_FABRICACION";
  return null;
}

export const MOTIVO_CAMBIO_MIN = 3;
export const MOTIVO_CAMBIO_MAX = 300;

export function parseMotivoCambio(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const motivo = typeof raw === "string" ? raw.trim() : "";
  if (motivo.length < MOTIVO_CAMBIO_MIN) return { ok: false, error: `Escribe el motivo (mínimo ${MOTIVO_CAMBIO_MIN} letras).` };
  if (motivo.length > MOTIVO_CAMBIO_MAX) return { ok: false, error: `El motivo no puede pasar de ${MOTIVO_CAMBIO_MAX} letras.` };
  return { ok: true, value: motivo };
}

/** Costo por unidad escrito a mano (pesos, sin puntos ni signo); null si no es un número ≥ 0. */
export function parseCostoUnitario(raw: unknown): number | null {
  const texto = typeof raw === "string" ? raw.replace(/[$.\s]/g, "").replace(",", ".") : "";
  if (!texto) return null;
  const valor = Number(texto);
  return Number.isFinite(valor) && valor >= 0 && valor <= 100_000_000 ? Math.round(valor * 100) / 100 : null;
}

export function bloqueoCambioModo(input: {
  esVenta: boolean;
  ordenEstado: string;
  ventaEstado: string | null;
  /** Piezas que cambian (un combo, todas las suyas en ese modo). */
  piezas: number;
}): string | null {
  if (!input.esVenta || input.ventaEstado === null) return "Solo se cambia en una orden de venta.";
  if (input.ordenEstado === "CANCELLED" || input.ventaEstado === "CANCELLED") return "La venta está cancelada.";
  if (input.piezas === 0) return "Este producto no está confirmado: cámbialo con el selector y guarda.";
  return null;
}

/** A_STOCK: lo que ya se le pagó a la proveedora en esta orden no puede quedar por encima de lo que le queda cargado. */
export function bloqueoPorPagosEnLaOrden(input: {
  proveedora: string;
  cargadoEnOrden: number;
  pagadoEnOrden: number;
  seAnula: number;
}): string | null {
  const queda = input.cargadoEnOrden - input.seAnula;
  if (input.pagadoEnOrden > queda + 0.005) {
    return `A ${input.proveedora} ya se le pagó $${Math.round(input.pagadoEnOrden).toLocaleString("es-CO")} en esta orden y solo le quedarían $${Math.round(Math.max(queda, 0)).toLocaleString("es-CO")} cargados. Anula o mueve ese pago primero.`;
  }
  return null;
}

/** Unidades que faltan en bodega (A_STOCK); suma las piezas del mismo producto. null si alcanza. */
export function faltaStock(piezas: { productId: string; nombre: string; cantidad: number; stock: number }[]): string | null {
  const pedido = new Map<string, number>();
  for (const pieza of piezas) {
    const total = (pedido.get(pieza.productId) ?? 0) + pieza.cantidad;
    pedido.set(pieza.productId, total);
    if (total > pieza.stock) return `No hay stock de ${pieza.nombre}: hay ${pieza.stock} y se necesitan ${total}.`;
  }
  return null;
}

export type LineaCosto = { cantidad: number; costoUnitario: number };

export const costoTotal = (lineas: LineaCosto[]) =>
  Math.round(lineas.reduce((suma, l) => suma + l.costoUnitario * l.cantidad, 0) * 100) / 100;

/** Ganancia de la venta como en Balances: valor − costo de productos − fletes. */
export const gananciaVenta = (valorVenta: number, costoProductos: number, fletes: number) =>
  Math.round((valorVenta - costoProductos - fletes) * 100) / 100;

/** A_FABRICACION: la pieza que ya va en un despacho activo (ni cancelado ni devuelto) nace recogida. */
export const naceRecogida = (estadosDespacho: string[]) =>
  estadosDespacho.some((estado) => estado !== "CANCELLED" && estado !== "RETURNED");
