import { describe, expect, it } from "vitest";
import { summarizeSupplierDebt } from "./supplier-debt";

const charge = (amount: number, orderId: string | null = null) => ({ type: "CHARGE" as const, amount, orderId, account: null });
const payment = (amount: number, orderId: string | null, account: string | null) => ({
  type: "PAYMENT" as const,
  amount,
  orderId,
  account,
});

describe("summarizeSupplierDebt", () => {
  it("una orden con dos abonos: pagado y falta", () => {
    const debt = summarizeSupplierDebt([charge(500_000, "o1"), payment(200_000, "o1", "Banco"), payment(100_000, "o1", "Caja")]);
    expect(debt.balance).toBe(200_000);
    expect(debt.orders).toHaveLength(1);
    expect(debt.orders[0]).toMatchObject({ orderId: "o1", charged: 500_000, paid: 300_000, pending: 200_000 });
    expect(debt.orders[0].payments.map((p) => p.account)).toEqual(["Banco", "Caja"]);
  });

  it("un abono sin cuenta cuenta igual como pagado", () => {
    const debt = summarizeSupplierDebt([charge(300_000, "o1"), payment(185_000, "o1", null)]);
    expect(debt.orders[0].pending).toBe(115_000);
    expect(debt.orders[0].payments[0].account).toBeNull();
    expect(debt.balance).toBe(115_000);
  });

  it("un cargo de inventario con un abono general va a 'otros' y el total cuadra", () => {
    const debt = summarizeSupplierDebt([charge(400_000, "o1"), charge(250_000), payment(100_000, null, "Banco")]);
    expect(debt.others).toMatchObject({ charged: 250_000, paid: 100_000, pending: 150_000 });
    expect(debt.orders[0].pending).toBe(400_000);
    expect(debt.balance).toBe(debt.orders[0].pending + debt.others.pending);
  });

  it("una orden ya pagada del todo queda en cero", () => {
    const debt = summarizeSupplierDebt([charge(600_000, "o1"), payment(600_000, "o1", "Banco"), charge(90_000, "o2")]);
    expect(debt.orders.find((o) => o.orderId === "o1")?.pending).toBe(0);
    expect(debt.balance).toBe(90_000);
  });
});
