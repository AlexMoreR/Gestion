// Reglas puras del pago a la proveedora en su orden de fabricacion (OF): cuanto cuesta,
// cuanto se le ha pagado y cuanto falta, y que revisar antes de registrar un pago.
// Las fechas van como texto "AAAA-MM-DD" (dia de calendario en Colombia).

import { todayInBogota } from "../../equipo/domain/team-member";

// Mismo tope que los gastos dichos a Claude.
export const SUPPLIER_PAYMENT_MAX_AMOUNT = 20_000_000;
// Margen por redondeo: pagar hasta $0,5 de mas no cuenta como sobrepago.
const OVERPAY_TOLERANCE = 0.5;

export type OfBalance = {
  costo: number | null;
  pagado: number;
  falta: number | null;
  costoConfirmado: boolean;
};

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Costo = cargos (CHARGE) de esa orden + proveedora; si no hay, los subtotales de las lineas.
// Sin ninguno de los dos el costo no se inventa: falta queda null.
export function computeOfBalance(params: {
  charges: number[];
  payments: number[];
  lineSubtotals: Array<number | null>;
}): OfBalance {
  const pagado = sum(params.payments);
  const subtotals = params.lineSubtotals.filter((value): value is number => value != null);
  const costo =
    params.charges.length > 0 ? sum(params.charges) : subtotals.length > 0 ? sum(subtotals) : null;
  if (costo == null || costo <= 0) {
    return { costo: null, pagado, falta: null, costoConfirmado: false };
  }
  // Un sobrepago se ve como "Falta $0", nunca negativo.
  return { costo, pagado, falta: Math.max(0, costo - pagado), costoConfirmado: true };
}

export type SupplierPaymentIssue = { tipo: "error" | "aviso"; campo: string; mensaje: string };

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
    issues.push({ tipo: "error", campo: "monto", mensaje: "El monto debe ser mayor que 0." });
  } else if (params.monto > SUPPLIER_PAYMENT_MAX_AMOUNT) {
    issues.push({ tipo: "error", campo: "monto", mensaje: "El monto pasa el tope de $20.000.000." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fecha)) {
    issues.push({ tipo: "error", campo: "fecha", mensaje: "La fecha debe ser AAAA-MM-DD." });
  } else if (params.fecha < params.hoy && !params.motivoFechaAnterior?.trim()) {
    issues.push({ tipo: "error", campo: "fecha", mensaje: "Una fecha anterior a hoy necesita un motivo." });
  }
  if (params.falta == null) {
    issues.push({ tipo: "aviso", campo: "monto", mensaje: "La OF no tiene costo confirmado." });
  } else if (params.monto > params.falta + OVERPAY_TOLERANCE) {
    if (params.motivoSobrepago?.trim()) {
      issues.push({ tipo: "aviso", campo: "monto", mensaje: "El pago es mayor que lo que falta." });
    } else {
      issues.push({
        tipo: "error",
        campo: "monto",
        mensaje: "El pago es mayor que lo que falta: escribe el motivo del sobrepago.",
      });
    }
  }
  return issues;
}

export type RecentSupplierPayment = { ofId: string; monto: number; createdAt: Date };

// Mismo pago repetido: misma OF, mismo monto y mismo dia (Colombia), creado hace pocos minutos.
export function isLikelyDuplicate(
  nuevo: RecentSupplierPayment,
  recientes: RecentSupplierPayment[],
  minutos = 10,
): boolean {
  const dia = todayInBogota(nuevo.createdAt);
  return recientes.some((pago) => {
    const diff = nuevo.createdAt.getTime() - pago.createdAt.getTime();
    return (
      pago.ofId === nuevo.ofId &&
      Math.abs(pago.monto - nuevo.monto) < 0.005 &&
      todayInBogota(pago.createdAt) === dia &&
      diff >= 0 &&
      diff <= minutos * 60_000
    );
  });
}
