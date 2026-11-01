// Reglas puras del pago a la proveedora en su orden de fabricacion (OF).
// Sin base de datos: imports relativos porque Vitest no resuelve el alias del proyecto.
import { colombiaDayKey } from "../../../lib/colombia-time";

export const SUPPLIER_PAYMENT_MAX = 20_000_000;
// Tolerancia de redondeo para decidir si un pago se pasa de lo que falta.
export const OVERPAYMENT_TOLERANCE = 0.5;

export type OfBalance = {
  costo: number | null;
  pagado: number;
  // null cuando el costo no esta confirmado: nunca se inventa. No baja de 0.
  falta: number | null;
  costoConfirmado: boolean;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// Costo = cargos (CHARGE) de la orden + proveedora; si no hay, subtotales de las lineas de la OF.
export function computeOfBalance(params: {
  charges: number[];
  payments: number[];
  lineSubtotals: Array<number | null>;
}): OfBalance {
  const pagado = sum(params.payments);
  const knownSubtotals = params.lineSubtotals.filter((value): value is number => value != null);
  const costo =
    params.charges.length > 0 ? sum(params.charges) : knownSubtotals.length > 0 ? sum(knownSubtotals) : null;
  if (costo == null || costo <= 0) {
    return { costo: null, pagado, falta: null, costoConfirmado: false };
  }
  return { costo, pagado, falta: Math.max(0, costo - pagado), costoConfirmado: true };
}

export type SupplierPaymentIssue = { campo: string; mensaje: string; tipo: "error" | "aviso" };

// Revisa un pago antes de guardarlo. `fecha` y `hoy` son dias AAAA-MM-DD (hoy = dia en Colombia).
export function validateSupplierPayment(params: {
  monto: number;
  falta: number | null;
  fecha: string;
  hoy: string;
  motivoFechaAnterior?: string | null;
  motivoSobrepago?: string | null;
}): SupplierPaymentIssue[] {
  const issues: SupplierPaymentIssue[] = [];
  if (!Number.isFinite(params.monto) || params.monto <= 0) {
    issues.push({ campo: "monto", mensaje: "El monto debe ser mayor que 0.", tipo: "error" });
  } else if (params.monto > SUPPLIER_PAYMENT_MAX) {
    issues.push({ campo: "monto", mensaje: "El monto no puede pasar de $20.000.000.", tipo: "error" });
  }
  if (params.fecha < params.hoy && !params.motivoFechaAnterior?.trim()) {
    issues.push({
      campo: "motivoFechaAnterior",
      mensaje: "La fecha es anterior a hoy: escribe el motivo.",
      tipo: "error",
    });
  }
  if (params.falta == null) {
    issues.push({ campo: "monto", mensaje: "La OF no tiene costo confirmado.", tipo: "aviso" });
  } else if (params.monto > params.falta + OVERPAYMENT_TOLERANCE) {
    if (params.motivoSobrepago?.trim()) {
      issues.push({ campo: "monto", mensaje: "El pago es mayor que lo que falta.", tipo: "aviso" });
    } else {
      issues.push({
        campo: "motivoSobrepago",
        mensaje: "El pago es mayor que lo que falta: escribe el motivo.",
        tipo: "error",
      });
    }
  }
  return issues;
}

export type RecentSupplierPayment = { ofId: string; monto: number; fecha: Date; creadoEn: Date };

// Posible doble registro: misma OF, mismo monto, mismo dia (Colombia) y creado hace pocos minutos.
export function isLikelyDuplicate(
  nuevo: RecentSupplierPayment,
  recientes: RecentSupplierPayment[],
  minutos = 10,
): boolean {
  const ventanaMs = minutos * 60_000;
  return recientes.some(
    (pago) =>
      pago.ofId === nuevo.ofId &&
      Math.abs(pago.monto - nuevo.monto) < 0.005 &&
      colombiaDayKey(pago.fecha) === colombiaDayKey(nuevo.fecha) &&
      Math.abs(nuevo.creadoEn.getTime() - pago.creadoEn.getTime()) <= ventanaMs,
  );
}
