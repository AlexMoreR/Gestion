import { describe, expect, it } from "vitest";
import { matchFreightPayments, planFreightAutoLink } from "./freight-without-account";

describe("matchFreightPayments", () => {
  const freight = { id: "f1", saleId: "sal-79", shippingProvider: "P-06 Eliécer" };

  it("solo mismo transportador y misma venta (sin importar tildes ni mayusculas)", () => {
    const payments = [
      { id: "ok", saleId: "sal-79", supplierName: " p-06  eliecer " },
      { id: "otra-venta", saleId: "sal-80", supplierName: "P-06 Eliécer" },
      { id: "otro-proveedor", saleId: "sal-79", supplierName: "Fabrica Gladys" },
      { id: "sin-venta", saleId: null, supplierName: "P-06 Eliécer" },
    ];
    expect(matchFreightPayments(freight, payments).map((payment) => payment.id)).toEqual(["ok"]);
  });

  it("sin pagos parecidos no propone nada", () => {
    expect(matchFreightPayments(freight, [])).toEqual([]);
  });
});

describe("planFreightAutoLink", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
  const freight = {
    id: "f1",
    saleId: "sal-1",
    orderId: "ord-1",
    shippingProvider: "P-06 Eliécer",
    amount: 185_000,
    date: day(10),
  };
  const payment = {
    id: "p1",
    saleId: null as string | null,
    orderId: null as string | null,
    supplierName: "P-06 Eliecer",
    isCarrier: true,
    hasAccount: true,
    amount: 185_000,
    date: day(10),
  };
  const ids = (links: { freightId: string; paymentId: string }[]) => links.map((l) => `${l.freightId}-${l.paymentId}`);

  it("misma venta y mismo monto: se une (regla A)", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, saleId: "sal-1", date: day(20) }])).toEqual([
      { freightId: "f1", paymentId: "p1", rule: "A" },
    ]);
  });

  it("misma orden (sin venta en el pago): se une", () => {
    expect(ids(planFreightAutoLink([freight], [{ ...payment, orderId: "ord-1" }]))).toEqual(["f1-p1"]);
  });

  it("mismo monto, pero el pago es a una fabrica: no se une", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, saleId: "sal-1", isCarrier: false }])).toEqual([]);
  });

  it("pago sin cuenta: no se une", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, saleId: "sal-1", hasAccount: false }])).toEqual([]);
  });

  it("regla B con una sola pareja a 4 dias: se une", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, date: day(14) }])).toEqual([
      { freightId: "f1", paymentId: "p1", rule: "B" },
    ]);
  });

  it("regla B a 6 dias: no se une", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, date: day(16) }])).toEqual([]);
  });

  it("regla B no usa pagos de otra venta", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, saleId: "sal-2" }])).toEqual([]);
  });

  it("dos parejas posibles sin transportador que las distinga: no se une", () => {
    const otros = [
      { ...payment, id: "p1", supplierName: "OLT Carga" },
      { ...payment, id: "p2", supplierName: "Envia" },
    ];
    expect(planFreightAutoLink([freight], otros)).toEqual([]);
  });

  it("dos parejas, una del mismo transportador: se une con esa", () => {
    const otros = [{ ...payment, id: "p1", supplierName: "OLT Carga" }, { ...payment, id: "p2" }];
    expect(ids(planFreightAutoLink([freight], otros))).toEqual(["f1-p2"]);
  });

  it("un pago nunca cubre dos fletes", () => {
    const f2 = { ...freight, id: "f2" };
    expect(ids(planFreightAutoLink([freight, f2], [{ ...payment, saleId: "sal-1" }]))).toEqual(["f1-p1"]);
  });

  it("montos distintos: no se une", () => {
    expect(planFreightAutoLink([freight], [{ ...payment, saleId: "sal-1", amount: 180_000 }])).toEqual([]);
  });

  it("regla A: gana el del mismo transportador y luego el mas cercano", () => {
    const opciones = [
      { ...payment, id: "lejos", saleId: "sal-1", date: day(25) },
      { ...payment, id: "otro", saleId: "sal-1", supplierName: "OLT Carga", date: day(10) },
      { ...payment, id: "cerca", saleId: "sal-1", date: day(11) },
    ];
    expect(ids(planFreightAutoLink([freight], opciones))).toEqual(["f1-cerca"]);
  });
});
