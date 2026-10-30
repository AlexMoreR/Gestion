import { describe, expect, it } from "vitest";
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { computeOfBalance, isLikelyDuplicate, validateSupplierPayment } from "./supplier-payment";

const base = { fecha: "2026-10-30", hoy: "2026-10-30" };
const errores = (issues: ReturnType<typeof validateSupplierPayment>) =>
  issues.filter((issue) => issue.tipo === "error").map((issue) => issue.campo);

describe("computeOfBalance", () => {
  it("falta = costo - pagado, con los cargos de la orden", () => {
    expect(computeOfBalance({ charges: [600000, 50000], payments: [200000], lineSubtotals: [1] })).toEqual({
      costo: 650000,
      pagado: 200000,
      falta: 450000,
      costoConfirmado: true,
    });
  });

  it("sin cargos usa los subtotales de las lineas", () => {
    const balance = computeOfBalance({ charges: [], payments: [100000], lineSubtotals: [300000, null] });
    expect(balance.costo).toBe(300000);
    expect(balance.falta).toBe(200000);
  });

  it("sobrepago se ve como falta 0", () => {
    expect(computeOfBalance({ charges: [100000], payments: [150000], lineSubtotals: [] }).falta).toBe(0);
  });

  it("OF sin costo: no inventa nada", () => {
    const balance = computeOfBalance({ charges: [], payments: [50000], lineSubtotals: [null] });
    expect(balance).toEqual({ costo: null, pagado: 50000, falta: null, costoConfirmado: false });
  });
});

describe("validateSupplierPayment", () => {
  it("monto 0 da error; 20.000.000 pasa; 20.000.001 da error", () => {
    expect(errores(validateSupplierPayment({ ...base, monto: 0, falta: 30_000_000 }))).toEqual(["monto"]);
    expect(errores(validateSupplierPayment({ ...base, monto: 20_000_000, falta: 30_000_000 }))).toEqual([]);
    expect(errores(validateSupplierPayment({ ...base, monto: 20_000_001, falta: 30_000_000 }))).toEqual(["monto"]);
  });

  it("sobrepago sin motivo da error; con motivo pasa", () => {
    expect(errores(validateSupplierPayment({ ...base, monto: 500001, falta: 500000 }))).toEqual(["monto"]);
    expect(
      errores(validateSupplierPayment({ ...base, monto: 500001, falta: 500000, motivoSobrepago: "anticipo" })),
    ).toEqual([]);
    // Hasta $0,5 de mas es redondeo.
    expect(errores(validateSupplierPayment({ ...base, monto: 500000.5, falta: 500000 }))).toEqual([]);
  });

  it("fecha anterior a hoy sin motivo da error; con motivo pasa", () => {
    const args = { monto: 100, falta: 1000, fecha: "2026-10-29", hoy: "2026-10-30" };
    expect(errores(validateSupplierPayment(args))).toEqual(["fecha"]);
    expect(errores(validateSupplierPayment({ ...args, motivoFechaAnterior: "pago de ayer" }))).toEqual([]);
  });
});

describe("isLikelyDuplicate", () => {
  const at = (iso: string) => new Date(iso);
  const previo = { ofId: "of1", monto: 300000, createdAt: at("2026-10-30T15:00:00Z") };

  it("misma OF y monto dentro de 10 minutos cuenta", () => {
    expect(isLikelyDuplicate({ ofId: "of1", monto: 300000, createdAt: at("2026-10-30T15:10:00Z") }, [previo])).toBe(true);
  });

  it("a los 11 minutos o con otro monto no", () => {
    expect(isLikelyDuplicate({ ofId: "of1", monto: 300000, createdAt: at("2026-10-30T15:11:00Z") }, [previo])).toBe(false);
    expect(isLikelyDuplicate({ ofId: "of1", monto: 300001, createdAt: at("2026-10-30T15:05:00Z") }, [previo])).toBe(false);
    expect(isLikelyDuplicate({ ofId: "of2", monto: 300000, createdAt: at("2026-10-30T15:05:00Z") }, [previo])).toBe(false);
  });

  it("si cruza la medianoche de Colombia no es el mismo dia", () => {
    const tarde = { ofId: "of1", monto: 1, createdAt: at("2026-10-31T04:58:00Z") };
    expect(isLikelyDuplicate({ ofId: "of1", monto: 1, createdAt: at("2026-10-31T05:02:00Z") }, [tarde])).toBe(false);
  });
});

describe("la ganancia no cambia con los pagos", () => {
  it("computeItemUnitCost usa purchaseCost, haya o no pagos", () => {
    const item = { purchaseCost: 600000, fulfillmentMode: "MANUFACTURE", baseCost: 500000, additionalCost: 0 };
    const sinPagos = computeItemUnitCost(item);
    computeOfBalance({ charges: [600000], payments: [600000], lineSubtotals: [600000] });
    expect(sinPagos).toBe(600000);
    expect(computeItemUnitCost(item)).toBe(sinPagos);
  });
});
