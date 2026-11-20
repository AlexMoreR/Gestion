import { describe, expect, it } from "vitest";
import { buildSupplierPayables, type PayableEntry, type PayableOrderInfo } from "./supplier-payables";

let seq = 0;
const charge = (amount: number, orderId: string | null, extra: Partial<PayableEntry> = {}): PayableEntry => ({
  id: `e${++seq}`,
  type: "CHARGE",
  amount,
  orderId,
  settlesEntryId: null,
  code: null,
  isInventory: false,
  ...extra,
});
const payment = (amount: number, orderId: string | null, settlesEntryId: string | null = null): PayableEntry => ({
  ...charge(amount, orderId),
  type: "PAYMENT",
  settlesEntryId,
});
const sale = (paymentMethod: PayableOrderInfo["paymentMethod"], orderStatus = "IN_PRODUCTION"): PayableOrderInfo => ({
  orderCode: "ORD-00001",
  manufacturingCode: "OF-00001",
  saleCode: "SAL-00001",
  clientName: "Clienta",
  products: ["Camilla"],
  orderType: "SALE",
  orderStatus,
  paymentMethod,
  hasSale: true,
});
const laura = (entries: PayableEntry[], orders: Record<string, PayableOrderInfo>) =>
  buildSupplierPayables([{ supplierId: "s1", name: "Laura", entries, orders: new Map(Object.entries(orders)) }]);

describe("buildSupplierPayables", () => {
  it("1. venta 50/50 con saldo va a hoy", () => {
    const r = laura([charge(580000, "o1"), payment(200000, "o1")], { o1: sale("ANTICIPO_50_50") });
    expect(r.today).toHaveLength(1);
    expect(r.today[0]).toMatchObject({ pending: 380000, paid: 200000, cost: 580000, reason: "Venta 50/50 – OF confirmada" });
    expect(r.upcoming).toHaveLength(0);
  });

  it("2. contraentrega sin entregar va a próximos", () => {
    const r = laura([charge(500000, "o1")], { o1: sale("CONTRAENTREGA", "DISPATCHED") });
    expect(r.today).toHaveLength(0);
    expect(r.upcoming[0].reason).toBe("Contraentrega: se paga al entregar");
  });

  it("3. contraentrega entregada va a hoy", () => {
    const r = laura([charge(500000, "o1")], { o1: sale("CONTRAENTREGA", "COMPLETED") });
    expect(r.today[0].reason).toBe("Contraentrega entregada");
    expect(r.upcoming).toHaveLength(0);
  });

  it("4. compra sin venta va a hoy", () => {
    const info = { ...sale(null), orderType: "PURCHASE" as const, saleCode: null, hasSale: false };
    const r = laura([charge(300000, "o1")], { o1: info });
    expect(r.today[0].reason).toBe("Compra de inventario");
  });

  it("5. cargo de inventario pagado en parte va a hoy por lo que falta", () => {
    const inv = charge(400000, null, { code: "INV-00003", isInventory: true });
    const r = laura([inv, payment(150000, null, inv.id)], {});
    expect(r.today).toHaveLength(1);
    expect(r.today[0]).toMatchObject({ target: `charge:${inv.id}`, pending: 250000, reason: "Compra de inventario" });
  });

  it("6. orden ya pagada no aparece", () => {
    const r = laura([charge(500000, "o1"), payment(500000, "o1")], { o1: sale("ANTICIPO_50_50") });
    expect(r.today).toHaveLength(0);
    expect(r.upcoming).toHaveLength(0);
  });

  it("7. orden cancelada va a próximos", () => {
    const r = laura([charge(500000, "o1")], { o1: sale("ANTICIPO_50_50", "CANCELLED") });
    expect(r.upcoming[0].reason).toBe("Orden cancelada: revisar");
    expect(r.today).toHaveLength(0);
  });

  it("8. hoy + próximos - a favor da el saldo de cada proveedora", () => {
    const inv = charge(400000, null, { isInventory: true });
    const r = laura(
      [
        charge(580000, "o1"),
        payment(290000, "o1"),
        charge(500000, "o2"),
        charge(300000, "o3"),
        payment(350000, "o3"), // pagada de más
        inv,
        payment(100000, null), // abono general
        charge(200000, "o4"),
      ],
      { o1: sale("ANTICIPO_50_50"), o2: sale("CONTRAENTREGA"), o3: sale("PAGO_TOTAL"), o4: sale(null) },
    );
    const total = r.suppliers[0];
    expect(total.balance).toBe(580000 - 290000 + 500000 + 300000 - 350000 + 400000 - 100000 + 200000);
    expect(total.today).toBe(290000 + 400000 + 200000);
    expect(total.upcoming).toBe(500000);
    expect(total.inFavor).toBe(150000);
    expect(total.today + total.upcoming - total.inFavor).toBe(total.balance);
    expect(r.totalToday).toBe(total.today);
  });
});
