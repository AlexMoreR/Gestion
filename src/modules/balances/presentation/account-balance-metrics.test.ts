import { describe, expect, it } from "vitest";
import type { AccountTransaction } from "../domain/entities";
import {
  accountMonthKey,
  accountMonthRange,
  attachAccountTransactionBalances,
  computeAccountBalanceMetrics,
  currentBogotaMonthKey,
} from "./account-balance-metrics";

describe("account balance metrics", () => {
  it("counts date-only UTC transactions on the first day inside the selected month", () => {
    const transactions: AccountTransaction[] = [
      {
        id: "expense:1",
        date: new Date("2026-06-01T00:00:00.000Z"),
        type: "EXPENSE",
        concept: "Gasto",
        reference: null,
        amount: -645000,
        receiptUrl: null,
        receiptName: null,
      },
      {
        id: "sale-payment:1",
        date: new Date("2026-06-30T00:00:00.000Z"),
        type: "INCOME",
        concept: "Pago venta",
        reference: null,
        amount: 6213000,
        receiptUrl: null,
        receiptName: null,
      },
    ];

    const result = computeAccountBalanceMetrics(transactions, 0, accountMonthRange("2026-06"));

    expect(result.periodOpening).toBe(0);
    expect(result.ingreso).toBe(6213000);
    expect(result.gasto).toBe(645000);
    expect(result.balance).toBe(5568000);
  });

  it("uses UTC keys for accounting dates and Bogota for the current month default", () => {
    expect(accountMonthKey(new Date("2026-06-01T00:00:00.000Z"))).toBe("2026-06");
    expect(currentBogotaMonthKey(new Date("2026-07-01T01:00:00.000Z"))).toBe("2026-06");
  });

  it("attaches the running account balance to transactions shown newest first", () => {
    const transactions: AccountTransaction[] = [
      {
        id: "sale-payment:2",
        date: new Date("2026-06-30T00:00:00.000Z"),
        type: "INCOME",
        concept: "Pago venta",
        reference: null,
        amount: 2511000,
        receiptUrl: null,
        receiptName: null,
      },
      {
        id: "supplier-payment:1",
        date: new Date("2026-06-29T00:00:00.000Z"),
        type: "EXPENSE",
        concept: "Pago proveedor",
        reference: null,
        amount: -380000,
        receiptUrl: null,
        receiptName: null,
      },
      {
        id: "sale-payment:1",
        date: new Date("2026-06-27T00:00:00.000Z"),
        type: "INCOME",
        concept: "Pago venta",
        reference: null,
        amount: 500000,
        receiptUrl: null,
        receiptName: null,
      },
    ];

    const result = attachAccountTransactionBalances(transactions, 0);

    expect(result.map((row) => row.runningBalance)).toEqual([2631000, 120000, 500000]);
  });
});
