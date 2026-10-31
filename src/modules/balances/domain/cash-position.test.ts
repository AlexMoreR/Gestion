import { describe, expect, it } from "vitest";
import { summarizeCashPosition } from "./cash-position";
import type { AccountBalance } from "./entities";

function account(partial: Partial<AccountBalance>): AccountBalance {
  return {
    id: "x",
    name: "Cuenta",
    type: "BANK",
    reference: null,
    isActive: true,
    openingBalance: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    periodOpening: 0,
    ingreso: 0,
    gasto: 0,
    movimientos: 0,
    balance: 0,
    ...partial,
  };
}

const none = { count: 0, amount: 0 };

describe("summarizeCashPosition", () => {
  it("saldo actual = inicial + neto, agrupado por tipo", () => {
    const position = summarizeCashPosition(
      [
        account({ id: "caja", name: "Caja", type: "CASH", periodOpening: 100000, balance: 50000 }),
        account({ id: "banco", name: "Bancolombia", type: "BANK", periodOpening: 0, balance: 900000 }),
        account({ id: "nequi", name: "Nequi", type: "WALLET", periodOpening: 20000, balance: -5000 }),
        account({ id: "vieja", name: "Vieja", type: "BANK", isActive: false, periodOpening: 0, balance: 0 }),
      ],
      { salePayments: { count: 2, amount: 300000 }, supplierPayments: none, shippingCosts: { count: 1, amount: 20000 } },
    );
    expect(position.accounts.map((line) => line.id)).toEqual(["caja", "banco", "nequi"]);
    expect(position.byType).toEqual([
      { type: "CASH", label: "Efectivo", balance: 150000 },
      { type: "BANK", label: "Bancos", balance: 900000 },
      { type: "WALLET", label: "Billeteras", balance: 15000 },
    ]);
    expect(position.total).toBe(1065000);
    expect(position.withoutAccount.count).toBe(3);
  });

  it("la cuenta de aportes del dueño (OWNER) no cambia el total", () => {
    const position = summarizeCashPosition(
      [
        account({ id: "caja", name: "Caja", type: "CASH", periodOpening: 100000, balance: 50000 }),
        account({ id: "aportes", name: "Aportes del dueño", type: "OWNER", periodOpening: 0, balance: -800000 }),
      ],
      { salePayments: none, supplierPayments: none, shippingCosts: none },
    );
    expect(position.accounts.map((line) => line.id)).toEqual(["caja"]);
    expect(position.byType.map((group) => group.type)).toEqual(["CASH", "BANK"]);
    expect(position.total).toBe(150000);
  });
});
