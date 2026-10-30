// Cuanto se le debe a una proveedora: lo cargado menos lo abonado en su cuenta corriente
// (SupplierLedgerEntry). Es la misma cuenta del saldo de la lista /admin/proveedores; la usan esa
// pantalla y la herramienta deuda_con_proveedoras del MCP.

export type SupplierDebtEntry = {
  type: "CHARGE" | "PAYMENT";
  amount: number;
  orderId: string | null;
};

export type SupplierOrderDebt<Entry extends SupplierDebtEntry> = {
  orderId: string;
  charged: number;
  paid: number;
  pending: number;
  payments: Entry[];
};

export type SupplierDebt<Entry extends SupplierDebtEntry> = {
  // Saldo total: cargos - abonos (positivo = le debemos).
  balance: number;
  // Por orden, en el orden en que aparecen los movimientos.
  orders: SupplierOrderDebt<Entry>[];
  // Cargos de inventario o manuales y abonos que no van a ninguna orden (para que el total cuadre).
  others: { charged: number; paid: number; pending: number; payments: Entry[] };
};

export function summarizeSupplierDebt<Entry extends SupplierDebtEntry>(entries: Entry[]): SupplierDebt<Entry> {
  const orders = new Map<string, SupplierOrderDebt<Entry>>();
  const others = { charged: 0, paid: 0, pending: 0, payments: [] as Entry[] };
  let balance = 0;

  for (const entry of entries) {
    balance += entry.type === "CHARGE" ? entry.amount : -entry.amount;
    let bucket: { charged: number; paid: number; payments: Entry[] } = others;
    if (entry.orderId) {
      const current = orders.get(entry.orderId) ?? { orderId: entry.orderId, charged: 0, paid: 0, pending: 0, payments: [] };
      orders.set(entry.orderId, current);
      bucket = current;
    }
    if (entry.type === "CHARGE") {
      bucket.charged += entry.amount;
    } else {
      bucket.paid += entry.amount;
      bucket.payments.push(entry);
    }
  }

  for (const order of orders.values()) order.pending = order.charged - order.paid;
  others.pending = others.charged - others.paid;
  return { balance, orders: [...orders.values()], others };
}
