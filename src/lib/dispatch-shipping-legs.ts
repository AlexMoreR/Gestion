// Tramos del envio de un despacho (varios proveedores de transporte en un mismo despacho).
// Ejemplo: el pedido llega de Bogota a Cali con un transportador ($80.000) y desde Cali se
// despacha al cliente con otro ($80.000): el valor del envio del despacho es $160.000.
//
// Reglas (puras, sin base de datos):
// - El tramo 0 es la transportadora principal del despacho (Dispatch.carrierSupplierId).
// - Dispatch.shippingCost = suma de los tramos. Balances, comisiones y cierres siguen sumando
//   ShippingCost (una fila por tramo), asi que todos leen el total sin cambios.
// - Cada tramo genera su propio cargo en la cuenta del proveedor que lo cobra.
// - Al transportador se le paga de una (decision del dueno, 30-oct-2026): cada tramo con valor
//   lleva la cuenta de donde salio la plata y el comprobante (salvo efectivo, como en Gastos).

export const MAX_EXTRA_SHIPPING_LEGS = 10;
const TRACKING_MAX = 120;
const NOTE_MAX = 250;

export type ExtraShippingLegInput = {
  carrierSupplierId: string;
  amount: number;
  trackingNumber: string | null;
  note: string | null;
  /** Cuenta de donde salio el pago del tramo. */
  accountId: string | null;
  /** Nombre del campo de archivo con el comprobante del tramo (legReceipt-<n>). */
  receiptField: string | null;
};

// Pago del tramo: valor > 0 exige una cuenta activa, y el comprobante salvo cuenta de efectivo.
// Un tramo en $0 no mueve plata y no pide nada.
export function legPaymentError(input: {
  amount: number;
  account: { isActive: boolean; type: string } | null;
  hasReceipt: boolean;
}): string | null {
  if (!(input.amount > 0)) {
    return null;
  }
  if (!input.account || !input.account.isActive) {
    return "Elige la cuenta de donde salio el pago del flete";
  }
  if (input.account.type !== "CASH" && !input.hasReceipt) {
    return "Sube el comprobante del pago del flete (solo en efectivo no hace falta)";
  }
  return null;
}

export type ShippingLeg = {
  position: number;
  carrierSupplierId: string | null;
  carrierName: string;
  amount: number;
  trackingNumber: string | null;
  note: string | null;
};

function toMoney(value: unknown): number {
  if (typeof value === "string") {
    // Pesos enteros: se aceptan "80000", "80.000" o "$ 80.000"; cualquier otra cosa es invalida.
    const digits = value.trim().replace(/[.\s$]/g, "");
    return /^\d+$/.test(digits) ? Number(digits) : NaN;
  }
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : NaN;
}

function toText(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

// Lee los tramos adicionales que manda el modal de despacho (JSON en un input oculto).
// Las filas vacias (sin proveedor y sin valor) se ignoran. Un valor sin proveedor, un valor
// invalido o demasiadas filas devuelven error para no registrar un envio a medias.
export function parseExtraShippingLegs(
  raw: FormDataEntryValue | null,
): { legs: ExtraShippingLegInput[]; error: string | null } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { legs: [], error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { legs: [], error: "Tramos de envio invalidos" };
  }
  if (!Array.isArray(parsed)) {
    return { legs: [], error: "Tramos de envio invalidos" };
  }

  const legs: ExtraShippingLegInput[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const carrierSupplierId = typeof row.carrierSupplierId === "string" ? row.carrierSupplierId.trim() : "";
    const rawAmount = row.amount;
    const isBlankAmount = rawAmount === undefined || rawAmount === null || rawAmount === "";
    const amount = isBlankAmount ? 0 : toMoney(rawAmount);
    const trackingNumber = toText(row.trackingNumber, TRACKING_MAX);
    const note = toText(row.note, NOTE_MAX);
    const accountId = toText(row.accountId, 64);
    const receiptField =
      typeof row.receiptField === "string" && /^legReceipt-\d{1,6}$/.test(row.receiptField) ? row.receiptField : null;

    if (!carrierSupplierId && amount === 0 && !trackingNumber && !note) {
      continue; // fila vacia
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { legs: [], error: "Valor de un tramo de envio invalido" };
    }
    if (!carrierSupplierId) {
      return { legs: [], error: "Selecciona el proveedor de cada tramo de envio" };
    }
    legs.push({ carrierSupplierId, amount, trackingNumber, note, accountId, receiptField });
  }

  if (legs.length > MAX_EXTRA_SHIPPING_LEGS) {
    return { legs: [], error: "Demasiados tramos de envio" };
  }
  return { legs, error: null };
}

// Suma de los tramos (pesos enteros). Es el "valor del envio" del despacho.
export function sumShippingLegs(legs: { amount: number }[]): number {
  return legs.reduce((sum, leg) => sum + (Number.isFinite(leg.amount) ? Math.round(leg.amount) : 0), 0);
}

// Arma la lista ordenada de tramos: el principal (posicion 0) y luego los adicionales.
export function buildShippingLegs(
  main: { carrierSupplierId: string; carrierName: string; amount: number; trackingNumber: string | null },
  extras: (Omit<ExtraShippingLegInput, "accountId" | "receiptField"> & { carrierName: string })[],
): ShippingLeg[] {
  return [
    {
      position: 0,
      carrierSupplierId: main.carrierSupplierId,
      carrierName: main.carrierName,
      amount: Math.round(main.amount),
      trackingNumber: main.trackingNumber,
      note: null,
    },
    ...extras.map((leg, index) => ({
      position: index + 1,
      carrierSupplierId: leg.carrierSupplierId,
      carrierName: leg.carrierName,
      amount: Math.round(leg.amount),
      trackingNumber: leg.trackingNumber,
      note: leg.note,
    })),
  ];
}

// Referencia del costo de envio (ShippingCost) de un tramo adicional. Deshacer el despacho
// la usa para encontrar y revertir ese costo; el tramo 0 conserva la referencia de siempre.
export function extraLegShippingReference(dispatchCode: string, position: number): string {
  return `Despacho ${dispatchCode} - tramo ${position + 1}`;
}

// Reparte un valor entre productos. Peso = el costo ya asignado a cada producto (si hay);
// si no, la cantidad. El residuo de redondeo va al ultimo para que la suma cuadre exacto.
export function distributeAmount(
  items: { id: string; quantity: number; weight: number }[],
  amount: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const total = Math.round(amount);
  if (items.length === 0) {
    return result;
  }
  const weightSum = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const useWeight = weightSum > 0;
  const base = useWeight ? weightSum : items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);

  let assigned = 0;
  items.forEach((item, index) => {
    let share: number;
    if (index === items.length - 1) {
      share = total - assigned;
    } else if (base <= 0) {
      share = Math.round(total / items.length);
    } else {
      share = Math.round((total * Math.max(0, useWeight ? item.weight : item.quantity)) / base);
    }
    assigned += share;
    result.set(item.id, share);
  });
  return result;
}

// Tramo equivalente de un despacho viejo (antes de los tramos). Es la misma regla de la
// migracion 20261014120000_despacho_varios_proveedores; tambien sirve de respaldo en pantalla.
export function legacyDispatchLeg(dispatch: {
  carrierSupplierId: string | null;
  carrierName: string | null;
  carrierSupplierName?: string | null;
  shippingCost: number | null;
  trackingNumber: string | null;
}): ShippingLeg | null {
  const name = dispatch.carrierName?.trim() || dispatch.carrierSupplierName?.trim() || "";
  const amount = dispatch.shippingCost ?? 0;
  if (!dispatch.carrierSupplierId && !name && !(amount > 0)) {
    return null;
  }
  return {
    position: 0,
    carrierSupplierId: dispatch.carrierSupplierId,
    carrierName: name || "Sin transportadora",
    amount,
    trackingNumber: dispatch.trackingNumber?.trim() || null,
    note: null,
  };
}

// Tramos a mostrar: los guardados (ordenados) o, si no hay, el tramo equivalente del despacho.
export function resolveDispatchLegs(
  stored: ShippingLeg[],
  dispatch: Parameters<typeof legacyDispatchLeg>[0],
): ShippingLeg[] {
  if (stored.length > 0) {
    return [...stored].sort((a, b) => a.position - b.position);
  }
  const legacy = legacyDispatchLeg(dispatch);
  return legacy ? [legacy] : [];
}
