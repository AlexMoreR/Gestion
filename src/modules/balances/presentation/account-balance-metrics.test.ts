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

describe("reviewAccountHistory", () => {
  it("una cuenta que nunca baja de cero no necesita saldo inicial", () => {
    const result = reviewAccountHistory(
      [txn("b", "2026-06-02", -100), txn("a", "2026-06-01", 500)],
      { openingBalance: 0, accountType: "CASH" },
    );
    expect(result.neededOpening).toBe(0);
    expect(result.firstNegative).toBeNull();
    expect(result.lowestBalance).toBe(0);
  });

  it("una cuenta que baja a -300 necesita 300 y marca la fecha", () => {
    const result = reviewAccountHistory(
      [txn("c", "2026-06-05", 200), txn("b", "2026-06-03", -500), txn("a", "2026-06-01", 200)],
      { openingBalance: 0, accountType: "BANK" },
    );
    expect(result.lowestBalance).toBe(-300);
    expect(result.lowestDate?.toISOString()).toBe("2026-06-03T00:00:00.000Z");
    expect(result.neededOpening).toBe(300);
    expect(result.firstNegative?.id).toBe("b");
    expect(result.firstNegative?.balance).toBe(-300);
  });

  it("descuenta el saldo inicial del que haría falta", () => {
    const result = reviewAccountHistory([txn("a", "2026-06-01", -500)], { openingBalance: 200, accountType: "BANK" });
    expect(result.neededOpening).toBe(300);
  });

  it("el mismo día cuenta primero la entrada y luego la salida", () => {
    const result = reviewAccountHistory(
      [txn("salida", "2026-06-01", -400), txn("entrada", "2026-06-01", 400)],
      { openingBalance: 0, accountType: "CASH" },
    );
    expect(result.neededOpening).toBe(0);
    expect(result.firstNegative).toBeNull();
  });

  it("una salida con nota de Transferencia Bancolombia es sospechosa solo en efectivo", () => {
    const transactions = [
      txn("a", "2026-06-01", 100),
      txn("b", "2026-06-02", -400, { note: "Transferéncia BANCOLOMBIA" }),
    ];
    const cash = reviewAccountHistory(transactions, { openingBalance: 0, accountType: "CASH" });
    expect(cash.suspicious.map((row) => row.id)).toEqual(["b"]);
    expect(cash.suspicious[0].signal).toContain("transferencia");
    expect(cash.neededOpening).toBe(300);
    expect(cash.neededOpeningWithoutSuspicious).toBe(0);

    const bank = reviewAccountHistory(transactions, { openingBalance: 0, accountType: "BANK" });
    expect(bank.suspicious).toEqual([]);
  });
});
