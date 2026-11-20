// "Por pagar hoy" de /admin/proveedores: qué se le paga ya a cada proveedora y qué viene después.
// Solo lectura. Parte del mismo saldo de la lista (summarizeSupplierDebt), así los totales cuadran
// con el Saldo de cada proveedora y con deuda_con_proveedoras.
import { summarizeSupplierDebt } from "./supplier-debt";

export type PayableEntry = {
  id: string;
  type: "CHARGE" | "PAYMENT";
  amount: number;
  orderId: string | null;
  settlesEntryId: string | null;
  code: string | null;
  isInventory: boolean;
};

export type PayableOrderInfo = {
  orderCode: string;
  manufacturingCode: string | null;
  saleCode: string | null;
  clientName: string | null;
  products: string[];
  orderType: "SALE" | "PURCHASE";
  orderStatus: string;
  // null = venta vieja sin forma de pago; undefined/no venta = compra.
  paymentMethod: "ANTICIPO_50_50" | "PAGO_TOTAL" | "CONTRAENTREGA" | null;
  hasSale: boolean;
};

export type PayableSupplier = {
  supplierId: string;
  name: string;
  entries: PayableEntry[];
  orders: Map<string, PayableOrderInfo>;
};

export type PayableRow = {
  supplierId: string;
  supplierName: string;
  // "order:<id>" o "charge:<id>": lo mismo que entiende el diálogo de pago de la cuenta.
  target: string;
  manufacturingCode: string | null;
  orderCode: string | null;
  saleCode: string | null;
  clientName: string | null;
  products: string[];
  cost: number;
  paid: number;
  pending: number;
  reason: string;
};

export type PayableSupplierTotal = {
  supplierId: string;
  name: string;
  balance: number;
  today: number;
  upcoming: number;
  // Abonos sin orden o pagados de más: hoy + próximos - aFavor = saldo.
  inFavor: number;
};

export type SupplierPayables = {
  today: PayableRow[];
  upcoming: PayableRow[];
  suppliers: PayableSupplierTotal[];
  totalToday: number;
  totalUpcoming: number;
};

const EPS = 0.0001;

// Regla del negocio: dónde va una orden con saldo y por qué.
export function clasificarPorPagar(info: PayableOrderInfo | undefined): { when: "today" | "upcoming"; reason: string } {
  if (!info) return { when: "today", reason: "Orden con saldo" };
  if (info.orderStatus === "CANCELLED") return { when: "upcoming", reason: "Orden cancelada: revisar" };
  if (info.orderType === "PURCHASE" || !info.hasSale) return { when: "today", reason: "Compra de inventario" };
  if (info.paymentMethod === "CONTRAENTREGA") {
    return info.orderStatus === "COMPLETED"
      ? { when: "today", reason: "Contraentrega entregada" }
      : { when: "upcoming", reason: "Contraentrega: se paga al entregar" };
  }
  if (info.paymentMethod === "PAGO_TOTAL") return { when: "today", reason: "Pago total – OF confirmada" };
  if (info.paymentMethod === "ANTICIPO_50_50") return { when: "today", reason: "Venta 50/50 – OF confirmada" };
  // Ventas viejas sin forma de pago: ya deberían estar pagadas (decisión del plan).
  return { when: "today", reason: "Venta sin forma de pago – OF confirmada" };
}

export function buildSupplierPayables(suppliers: PayableSupplier[]): SupplierPayables {
  const today: PayableRow[] = [];
  const upcoming: PayableRow[] = [];
  const totals: PayableSupplierTotal[] = [];

  for (const supplier of suppliers) {
    const debt = summarizeSupplierDebt(supplier.entries);
    let supplierToday = 0;
    let supplierUpcoming = 0;
    let overpaidOrders = 0;

    for (const order of debt.orders) {
      if (order.pending <= EPS) {
        overpaidOrders += Math.min(0, order.pending);
        continue;
      }
      const info = supplier.orders.get(order.orderId);
      const { when, reason } = clasificarPorPagar(info);
      const row: PayableRow = {
        supplierId: supplier.supplierId,
        supplierName: supplier.name,
        target: `order:${order.orderId}`,
        manufacturingCode: info?.manufacturingCode ?? null,
        orderCode: info?.orderCode ?? null,
        saleCode: info?.saleCode ?? null,
        clientName: info?.clientName ?? null,
        products: info?.products ?? [],
        cost: order.charged,
        paid: order.paid,
        pending: order.pending,
        reason,
      };
      if (when === "today") {
        today.push(row);
        supplierToday += row.pending;
      } else {
        upcoming.push(row);
        supplierUpcoming += row.pending;
      }
    }

    // Cargos sin orden (inventario o manuales): lo que falta = monto - abonos que lo saldan,
    // igual que la pantalla de la cuenta.
    const settled = new Map<string, number>();
    for (const entry of supplier.entries) {
      if (entry.type === "PAYMENT" && entry.settlesEntryId) {
        settled.set(entry.settlesEntryId, (settled.get(entry.settlesEntryId) ?? 0) + entry.amount);
      }
    }
    let chargeRows = 0;
    for (const entry of supplier.entries) {
      if (entry.type !== "CHARGE" || entry.orderId) continue;
      const paid = settled.get(entry.id) ?? 0;
      const pending = entry.amount - paid;
      if (pending <= EPS) continue;
      today.push({
        supplierId: supplier.supplierId,
        supplierName: supplier.name,
        target: `charge:${entry.id}`,
        manufacturingCode: null,
        orderCode: entry.code,
        saleCode: null,
        clientName: null,
        products: [],
        cost: entry.amount,
        paid,
        pending,
        reason: entry.isInventory ? "Compra de inventario" : "Cargo manual",
      });
      supplierToday += pending;
      chargeRows += pending;
    }

    const inFavor = chargeRows - debt.others.pending - overpaidOrders;
    if (supplierToday > EPS || supplierUpcoming > EPS || Math.abs(debt.balance) > EPS) {
      totals.push({
        supplierId: supplier.supplierId,
        name: supplier.name,
        balance: debt.balance,
        today: supplierToday,
        upcoming: supplierUpcoming,
        inFavor,
      });
    }
  }

  const byName = (a: PayableRow, b: PayableRow) =>
    a.supplierName.localeCompare(b.supplierName, "es") ||
    (a.manufacturingCode ?? a.orderCode ?? "").localeCompare(b.manufacturingCode ?? b.orderCode ?? "", "es", { numeric: true });
  today.sort(byName);
  upcoming.sort(byName);

  return {
    today,
    upcoming,
    suppliers: totals,
    totalToday: totals.reduce((sum, s) => sum + s.today, 0),
    totalUpcoming: totals.reduce((sum, s) => sum + s.upcoming, 0),
  };
}
