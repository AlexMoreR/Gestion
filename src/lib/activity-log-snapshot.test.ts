import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { SHIPPING_COST_LOG_FIELDS, SUPPLIER_LEDGER_LOG_FIELDS, snapshotForLog } from "./activity-log-snapshot";

describe("snapshotForLog", () => {
  it("deja un abono con monto, fecha, cuenta y venta, sin el comprobante", () => {
    const abono = {
      id: "pay_1",
      amount: new Prisma.Decimal("150000.50"),
      paymentDate: new Date("2026-10-30T00:00:00.000Z"),
      accountId: "acc_1",
      saleId: "sale_1",
      receiptUrl: "/uploads/comprobante.jpg",
    };

    const foto = snapshotForLog(abono, ["amount", "paymentDate", "accountId", "saleId"]);

    expect(foto).toEqual({
      amount: 150000.5,
      paymentDate: "2026-10-30T00:00:00.000Z",
      accountId: "acc_1",
      saleId: "sale_1",
    });
    expect(foto).not.toHaveProperty("receiptUrl");
  });

  it("guarda null cuando el campo viene vacío", () => {
    expect(snapshotForLog({ accountId: null as string | null }, ["accountId"])).toEqual({ accountId: null });
  });

  it("las copias de pagos a proveedora y fletes nunca llevan la URL del comprobante", () => {
    expect(SUPPLIER_LEDGER_LOG_FIELDS).not.toContain("receiptUrl");
    expect(SHIPPING_COST_LOG_FIELDS).not.toContain("receiptUrl");
    expect(SUPPLIER_LEDGER_LOG_FIELDS).toEqual(expect.arrayContaining(["amount", "paymentDate", "accountId", "receiptName"]));
  });
});
