// Venta anulada (28-nov-2026, pedido de Ingrid, caso SAL-94): pasar sus productos de Fabricación a inventario
// sin deuda nueva con la proveedora y registrar la devolución de dinero a la clienta. Reglas puras.
import { esRetroactivo, validarMotivo } from "../modules/retroactivos/domain/retroactivo";
import { todayInColombia } from "./colombia-time";
import { parseCostoUnitario } from "./order-item-mode-change";

export const MOTIVO_VENTA_ANULADA_MIN = 3;
export const MOTIVO_VENTA_ANULADA_MAX = 500;
/** Campo del motivo de registro atrasado (fecha anterior a hoy), igual que en Gastos. */
export const MOTIVO_RETROACTIVO_FIELD = "motivoRetroactivo";

export type BloqueoPasarInput = {
  ventaEstado: string | null;
  ordenEstado: string;
  modo: string;
  /** Ya hay una entrada de inventario ligada a esta línea (o a su combo). */
  yaPaso: boolean;
};

export function bloqueoPasarAInventario(input: BloqueoPasarInput): string | null {
  if (input.ventaEstado !== "CANCELLED" || input.ordenEstado !== "CANCELLED") {
    return "Solo se pasa a inventario un producto de una venta anulada.";
  }
  if (input.modo !== "MANUFACTURE") return "Solo los productos de Fabricación se pasan a inventario.";
  if (input.yaPaso) return "Este producto ya se pasó a inventario.";
  return null;
}

export function parseMotivo(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const motivo = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_VENTA_ANULADA_MIN) {
    return { ok: false, error: `Escribe el motivo (mínimo ${MOTIVO_VENTA_ANULADA_MIN} letras).` };
  }
  if (motivo.length > MOTIVO_VENTA_ANULADA_MAX) {
    return { ok: false, error: `El motivo no puede pasar de ${MOTIVO_VENTA_ANULADA_MAX} letras.` };
  }
  return { ok: true, value: motivo };
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/** Lo que aún se puede devolver: lo pagado menos lo ya devuelto (nunca negativo). */
export function maxDevolucion(pagado: number, devuelto: number): number {
  return Math.max(redondear(pagado - devuelto), 0);
}

export type DevolucionInput = {
  accountId: unknown;
  monto: unknown;
  fecha: unknown;
  motivo: unknown;
  motivoRetroactivo?: unknown;
};

export type Devolucion = {
  accountId: string;
  monto: number;
  /** AAAA-MM-DD (día de Colombia que escribió la persona). */
  fecha: string;
  motivo: string;
  /** Solo si la fecha es anterior a hoy. */
  motivoRetroactivo: string | null;
};

/** Valida la devolución contra lo que falta devolver. `ahora` para las pruebas. */
export function parseDevolucion(
  input: DevolucionInput,
  maximo: number,
  ahora: Date = new Date(),
): { ok: true; value: Devolucion } | { ok: false; error: string } {
  const accountId = typeof input.accountId === "string" ? input.accountId.trim() : "";
  if (!accountId) return { ok: false, error: "Elige la cuenta de donde sale la plata." };
  const monto = parseCostoUnitario(input.monto);
  if (monto === null || monto <= 0) return { ok: false, error: "Escribe el monto devuelto (mayor a 0)." };
  if (monto > maximo) {
    return { ok: false, error: `No se puede devolver más de lo pagado: falta devolver $${maximo.toLocaleString("es-CO")}.` };
  }
  const fecha = typeof input.fecha === "string" ? input.fecha.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    return { ok: false, error: "La fecha no es válida." };
  }
  if (fecha > todayInColombia(ahora)) return { ok: false, error: "La fecha no puede ser después de hoy." };
  const motivo = parseMotivo(input.motivo);
  if (!motivo.ok) return motivo;
  let motivoRetroactivo: string | null = null;
  if (esRetroactivo(fecha, ahora)) {
    const retro = validarMotivo(input.motivoRetroactivo);
    if (!retro.ok) return retro;
    motivoRetroactivo = retro.motivo;
  }
  return { ok: true, value: { accountId, monto, fecha, motivo: motivo.value, motivoRetroactivo } };
}
