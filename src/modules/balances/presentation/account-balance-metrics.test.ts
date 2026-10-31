import { describe, expect, it } from "vitest";
import type { AccountTransaction } from "../domain/entities";
import {
  accountMonthKey,
  accountMonthRange,
  attachAccountTransactionBalances,
  computeAccountBalanceMetrics,
  currentBogotaMonthKey,
  reviewAccountHistory,
} from "./account-balance-metrics";

function txn(id: string, day: string, amount: number, extra: Partial<AccountTransaction> = {}): AccountTransaction {
  return {
    id,
    date: new Date(`${day}T00:00:00.000Z`),
    type: amount >= 0 ? "INCOME" : "EXPENSE",
    concept: id,
    reference: null,
    amount,
    receiptUrl: null,
    receiptName: null,
    ...extra,
  };
}

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

describe("reviewAccountHistory", () => {
  it("needs no opening balance when the account never goes below zero", () => {
    const result = reviewAccountHistory([txn("in", "2026-06-01", 500), txn("out", "2026-06-02", -400)], {
      openingBalance: 0,
      accountType: "CASH",
    });

    expect(result.neededOpening).toBe(0);
    expect(result.firstNegative).toBeNull();
    expect(result.lowestBalance).toBe(0);
  });

  it("finds the lowest point, its date and the first negative movement", () => {
    const result = reviewAccountHistory(
      // Llegan del más nuevo al más viejo, como en la página.
      [txn("in2", "2026-06-10", 1000), txn("out2", "2026-06-05", -100), txn("out1", "2026-06-03", -400), txn("in1", "2026-06-01", 200)],
      { openingBalance: 0, accountType: "BANK" },
    );

    expect(result.lowestBalance).toBe(-300);
    expect(result.neededOpening).toBe(300);
    expect(result.lowestDate).toEqual(new Date("2026-06-05T00:00:00.000Z"));
    expect(result.firstNegative).toMatchObject({ id: "out1", balance: -200 });
  });

  it("subtracts the current opening balance from what is needed", () => {
    const result = reviewAccountHistory([txn("out", "2026-06-01", -500)], { openingBalance: 200, accountType: "CASH" });

    expect(result.neededOpening).toBe(300);
  });

  it("counts the inflow before the outflow on the same day", () => {
    const result = reviewAccountHistory(
      [
        { ...txn("out", "2026-06-01", -500), date: new Date("2026-06-01T08:00:00.000Z") },
        { ...txn("in", "2026-06-01", 500), date: new Date("2026-06-01T20:00:00.000Z") },
      ],
      { openingBalance: 0, accountType: "CASH" },
    );

    expect(result.neededOpening).toBe(0);
    expect(result.firstNegative).toBeNull();
  });

  it("flags bank-looking outflows only in a CASH account", () => {
    const transactions = [
      txn("in", "2026-06-01", 100),
      txn("bank-out", "2026-06-02", -400, { note: "Transferéncia Bancolombia" }),
      txn("cash-out", "2026-06-03", -50, { note: "Pago en efectivo" }),
    ];

    const cash = reviewAccountHistory(transactions, { openingBalance: 0, accountType: "CASH" });
    expect(cash.suspicious.map((row) => row.id)).toEqual(["bank-out"]);
    expect(cash.suspicious[0]).toMatchObject({ amount: -400, signal: 'La nota dice "transferencia"' });
    expect(cash.neededOpening).toBe(350);
    expect(cash.neededOpeningWithoutSuspicious).toBe(0);

    const bank = reviewAccountHistory(transactions, { openingBalance: 0, accountType: "BANK" });
    expect(bank.suspicious).toEqual([]);
  });

  it("flags outflows with a transaction number or a receipt photo", () => {
    const result = reviewAccountHistory(
      [
        txn("ref", "2026-06-01", -10, { transactionReference: "123456" }),
        txn("photo", "2026-06-02", -10, { receiptUrl: "/uploads/x.jpg" }),
        txn("blank", "2026-06-03", -10, { transactionReference: "  " }),
      ],
      { openingBalance: 0, accountType: "CASH" },
    );

    expect(result.suspicious.map((row) => row.signal)).toEqual([
      "Número de comprobante: 123456",
      "Tiene foto del comprobante",
    ]);
  });
});
