/**
 * Descuento sobre una venta ya creada (p. ej. por daño en el transporte al entregar).
 * Baja el total de la venta y su saldo; nunca deja saldo a favor: el monto no puede pasar del saldo pendiente.
 */
export const MOTIVO_DESCUENTO_MIN = 3;

export type DescuentoVentaInput = {
  monto: number;
  motivo: string;
  /** Total actual de la venta (ya con descuentos anteriores). */
  total: number;
  /** Suma de los abonos registrados. */
  pagado: number;
  ventaCancelada: boolean;
  ordenCancelada: boolean;
};

export type DescuentoVentaResultado =
  | { ok: true; monto: number; motivo: string; nuevoTotal: number; nuevoSaldo: number }
  | { ok: false; error: string };

const redondear = (valor: number) => Math.round(valor * 100) / 100;

export function validarDescuentoVenta(input: DescuentoVentaInput): DescuentoVentaResultado {
  if (input.ventaCancelada) return { ok: false, error: "No se puede poner descuento a una venta anulada" };
  if (input.ordenCancelada) return { ok: false, error: "No se puede poner descuento: la orden está cancelada" };
  const monto = redondear(input.monto);
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El descuento debe ser mayor a cero" };
  const motivo = input.motivo.trim();
  if (motivo.length < MOTIVO_DESCUENTO_MIN) {
    return { ok: false, error: `Escribe el motivo del descuento (mínimo ${MOTIVO_DESCUENTO_MIN} letras)` };
  }
  const saldo = redondear(Math.max(input.total - input.pagado, 0));
  if (monto > saldo) {
    return { ok: false, error: "El descuento no puede ser mayor que el saldo pendiente de la venta" };
  }
  const nuevoTotal = redondear(input.total - monto);
  return { ok: true, monto, motivo, nuevoTotal, nuevoSaldo: redondear(Math.max(nuevoTotal - input.pagado, 0)) };
}
