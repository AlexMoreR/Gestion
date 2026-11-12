// Cancelar un producto de una venta (nov-2026). Reglas puras: cuándo se deja, cuánto baja la venta y
// el aviso a la proveedora. La escritura está en adminCancelSaleItemAction (orders-actions.ts).
// Lo que se cancela no se borra sin copia: la línea queda en RegistroAnulado (anularVarias).

export const CANCEL_ITEM_REASON_MIN = 3;
export const CANCEL_ITEM_REASON_MAX = 300;

export function parseCancelItemReason(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const motivo = typeof raw === "string" ? raw.trim() : "";
  if (motivo.length < CANCEL_ITEM_REASON_MIN) {
    return { ok: false, error: `Escribe el motivo (mínimo ${CANCEL_ITEM_REASON_MIN} letras).` };
  }
  if (motivo.length > CANCEL_ITEM_REASON_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${CANCEL_ITEM_REASON_MAX} letras.` };
  }
  return { ok: true, value: motivo };
}

export type PiezaACancelar = {
  fulfillmentMode: string;
  /** Despachos vivos (ni cancelados) donde está. */
  despachos: number;
  /** Devoluciones o reversas registradas de esta pieza. */
  devolucionesOReversas: number;
  fotos: number;
  supplierPaymentStatus: string | null;
  /** Su OF (de la proveedora confirmada) ya está recibida. */
  ofRecibida: boolean;
};

/**
 * Por qué no se puede cancelar (texto para la pantalla) o null. Solo se cancela lo que no ha empezado
 * de verdad: lo confirmado (stock o fabricación sin recibir) se deshace solo; lo recogido, recibido o
 * despachado hay que deshacerlo antes a mano.
 */
export function bloqueoCancelarProducto(input: {
  esVenta: boolean;
  ordenEstado: string;
  ventaEstado: string | null;
  devolucionAbierta: boolean;
  /** Cuántas piezas tiene la orden y cuántas caen en este producto (un combo, todas las suyas). */
  piezasOrden: number;
  piezas: PiezaACancelar[];
  /** En «Cambiar producto» el nuevo ya se agregó: que sea el único no bloquea. */
  enCambio?: boolean;
}): string | null {
  if (!input.esVenta || input.ventaEstado === null) return "Solo se cancelan productos de una orden de venta.";
  if (input.ordenEstado === "CANCELLED" || input.ventaEstado === "CANCELLED") return "La venta está cancelada.";
  if (input.ordenEstado === "COMPLETED") return "La orden ya está cerrada (entregada): no se cancelan productos.";
  if (input.devolucionAbierta) return "La orden tiene una devolución abierta: ciérrala o anúlala primero.";
  if (input.piezas.length === 0) return "Producto no encontrado.";
  if (!input.enCambio && input.piezas.length >= input.piezasOrden) {
    return "Es lo único que tiene la orden. Si lo cambia por otro, usa «Cambiar producto». Si ya no quiere nada, usa Cancelar en el menú ⋯ de la orden.";
  }
  for (const pieza of input.piezas) {
    if (pieza.despachos > 0) return "Ya salió en un despacho: primero deshaz el despacho.";
    if (pieza.devolucionesOReversas > 0) return "Tiene una devolución o reversa registrada: no se puede cancelar.";
    if (pieza.fulfillmentMode === "STOCK") continue;
    if (pieza.fotos > 0) return "Ya fue recogido: primero deshaz el recogido.";
    if (pieza.supplierPaymentStatus === "PAID") {
      return "Ya se le pagó a la proveedora por este producto: anula ese pago primero o habla con ella.";
    }
    if (pieza.ofRecibida) return "La proveedora ya lo entregó (OF recibida): no se puede cancelar.";
  }
  return null;
}

/** Cuánto baja la venta: lo que valían sus líneas de la cotización (o, sin ellas, las de la orden). */
export function montoACancelar(lineasCotizacion: { lineTotal: unknown }[], lineasOrden: { lineTotal: unknown }[]): number {
  const fuente = lineasCotizacion.length > 0 ? lineasCotizacion : lineasOrden;
  return Math.round(fuente.reduce((suma, linea) => suma + Number(linea.lineTotal), 0) * 100) / 100;
}

/** Plata de más: lo pagado por encima del total (0 si no sobra). */
export function saldoAFavor(pagado: number, total: number): number {
  return Math.max(Math.round((pagado - total) * 100) / 100, 0);
}

// Aviso en la OF: se reusa la tabla AvisoColorOF con esta marca en colorNuevo (sin migración).
export const AVISO_PRODUCTO_CANCELADO = "__CANCELADO__";

export function textoAvisoOF(aviso: { producto: string; colorViejo: string; colorNuevo: string }): string {
  if (aviso.colorNuevo === AVISO_PRODUCTO_CANCELADO) return `Producto cancelado: ${aviso.producto}. Ya no se fabrica.`;
  return `${aviso.producto} ${aviso.colorViejo} → ${aviso.colorNuevo}`;
}

/**
 * «Cambiar producto» (nov-2026): qué falta para poder guardar, o null. La usan la pantalla (botón
 * desactivado) y el servidor (no confía en la pantalla).
 */
export function faltaEnCambio(input: {
  motivo: string;
  lineasNuevas: number;
  /** El producto viejo ya está en una OF con la proveedora. */
  tieneOF: boolean;
  aceptaOF: boolean;
  ordenCancelada: boolean;
  reactivar: boolean;
}): string | null {
  if (input.lineasNuevas === 0) return "Agrega el producto nuevo.";
  const motivo = parseCancelItemReason(input.motivo);
  if (!motivo.ok) return motivo.error;
  if (input.tieneOF && !input.aceptaOF) return "Marca que entiendes que la OF mostrará el producto cancelado.";
  if (input.ordenCancelada && !input.reactivar) return "La orden está cancelada: marca «Reactivar la orden» para cambiar el producto.";
  return null;
}
