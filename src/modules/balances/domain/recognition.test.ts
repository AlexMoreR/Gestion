import { describe, expect, it } from "vitest";
import { computeFullyPaidAt, resolveProfitRecognition } from "./recognition";

const created = new Date("2026-09-01T15:00:00Z");
const paid = new Date("2026-09-28T15:00:00Z");
const delivered = new Date("2026-10-10T15:00:00Z");

describe("resolveProfitRecognition", () => {
  it("50/50 pagada y sin entregar: cuenta en la fecha del pago y solo falta la entrega", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: "ANTICIPO_50_50",
        orderStatus: "IN_PRODUCTION",
        deliveredAt: null,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toEqual({ recognizedAt: paid, pendingDelivery: true });
  });

  it("venta vieja sin forma de pago: igual que 50/50", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: null,
        orderStatus: "DISPATCHED",
        deliveredAt: null,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toEqual({ recognizedAt: paid, pendingDelivery: true });
  });

  it("al entregarla no cambia de mes: sigue en la fecha del pago", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: "ANTICIPO_50_50",
        orderStatus: "COMPLETED",
        deliveredAt: delivered,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toEqual({ recognizedAt: paid, pendingDelivery: false });
  });

  it("contraentrega sin entregar: no cuenta", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: "CONTRAENTREGA",
        orderStatus: "DISPATCHED",
        deliveredAt: null,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toBeNull();
  });

  it("contraentrega entregada: cuenta en la fecha de entrega", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: "CONTRAENTREGA",
        orderStatus: "COMPLETED",
        deliveredAt: delivered,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toEqual({ recognizedAt: delivered, pendingDelivery: false });
  });

  it("orden cancelada: no cuenta", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: null,
        orderStatus: "CANCELLED",
        deliveredAt: null,
        fullyPaidAt: paid,
        saleCreatedAt: created,
      }),
    ).toBeNull();
  });

  it("sin fecha de pago completo usa la entrega y luego la creacion", () => {
    expect(
      resolveProfitRecognition({
        paymentMethod: null,
        orderStatus: "COMPLETED",
        deliveredAt: delivered,
        fullyPaidAt: null,
        saleCreatedAt: created,
      })?.recognizedAt,
    ).toEqual(delivered);
    expect(
      resolveProfitRecognition({
        paymentMethod: null,
        orderStatus: null,
        deliveredAt: null,
        fullyPaidAt: null,
        saleCreatedAt: created,
      }),
    ).toEqual({ recognizedAt: created, pendingDelivery: true });
  });
});

describe("computeFullyPaidAt", () => {
  it("devuelve la fecha del abono que completa el total (en orden de fecha)", () => {
    expect(
      computeFullyPaidAt({
        total: 1_000_000,
        recordedPaid: 1_000_000,
        saleCreatedAt: created,
        payments: [
          { amount: 500_000, date: paid },
          { amount: 500_000, date: new Date("2026-09-05T15:00:00Z") },
        ],
      }),
    ).toEqual(paid);
  });

  it("no pagada por completo: null", () => {
    expect(
      computeFullyPaidAt({
        total: 1_000_000,
        recordedPaid: 600_000,
        saleCreatedAt: created,
        payments: [{ amount: 600_000, date: paid }],
      }),
    ).toBeNull();
  });

  it("ventas viejas: lo pagado sin abono cuenta desde la creacion", () => {
    expect(
      computeFullyPaidAt({ total: 800_000, recordedPaid: 800_000, saleCreatedAt: created, payments: [] }),
    ).toEqual(created);
  });
});
