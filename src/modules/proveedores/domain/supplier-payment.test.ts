import { describe, expect, it } from "vitest";
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { computeOfBalance, isLikelyDuplicate, validateSupplierPayment } from "./supplier-payment";

const errores = (issues: ReturnType<typeof validateSupplierPayment>) =>
  issues.filter((issue) => issue.tipo === "error").map((issue) => issue.campo);

const base = { falta: 500_000, fecha: "2026-11-01", hoy: "2026-11-01" };

describe("computeOfBalance", () => {
  it("falta = costo − pagado (con cargos)", () => {
    expect(computeOfBalance({ charges: [600_000, 100_000], payments: [300_000], lineSubtotals: [1] })).toEqual({
      costo: 700_000,
      pagado: 300_000,
      falta: 400_000,
      costoConfirmado: true,
    });
  });

  it("sin cargos usa los subtotales de las lineas", () => {
    expect(computeOfBalance({ charges: [], payments: [], lineSubtotals: [200_000, null] }).falta).toBe(200_000);
  });

  it("OF sin costo: costoConfirmado=false y falta=null", () => {
    const r = computeOfBalance({ charges: [], payments: [50_000], lineSubtotals: [null] });
    expect(r).toMatchObject({ costoConfirmado: false, falta: null, pagado: 50_000 });
  });

  it("sobrepago deja falta en 0", () => {
    expect(computeOfBalance({ charges: [100_000], payments: [150_000], lineSubtotals: [] }).falta).toBe(0);
  });
});

describe("validateSupplierPayment", () => {
  it("sobrepago sin motivo da error; con motivo pasa", () => {
    expect(errores(validateSupplierPayment({ ...base, monto: 600_000 }))).toContain("motivoSobrepago");
    expect(errores(validateSupplierPayment({ ...base, monto: 600_000, motivoSobrepago: "anticipo" }))).toEqual([]);
    expect(errores(validateSupplierPayment({ ...base, monto: 500_000.5 }))).toEqual([]);
  });

  it("fecha anterior a hoy sin motivo da error", () => {
    expect(errores(validateSupplierPayment({ ...base, monto: 100, fecha: "2026-10-31" }))).toEqual([
      "motivoFechaAnterior",
    ]);
    expect(
      errores(validateSupplierPayment({ ...base, monto: 100, fecha: "2026-10-31", motivoFechaAnterior: "se olvidó" })),
    ).toEqual([]);
  });

  it("tope: 0 da error, 20.000.000 pasa, 20.000.001 da error", () => {
    const sinFalta = { ...base, falta: 30_000_000 };
    expect(errores(validateSupplierPayment({ ...sinFalta, monto: 0 }))).toEqual(["monto"]);
    expect(errores(validateSupplierPayment({ ...sinFalta, monto: 20_000_000 }))).toEqual([]);
    expect(errores(validateSupplierPayment({ ...sinFalta, monto: 20_000_001 }))).toEqual(["monto"]);
  });
});

describe("isLikelyDuplicate", () => {
  const creado = new Date("2026-11-01T15:00:00Z");
  const previo = { ofId: "of1", monto: 300_000, fecha: new Date("2026-11-01T00:00:00Z"), creadoEn: creado };
  const nuevo = (minutos: number, monto = 300_000) => ({
    ...previo,
    monto,
    creadoEn: new Date(creado.getTime() + minutos * 60_000),
  });

  it("dentro de los 10 minutos cuenta; a los 11 o con otro monto no", () => {
    expect(isLikelyDuplicate(nuevo(10), [previo])).toBe(true);
    expect(isLikelyDuplicate(nuevo(11), [previo])).toBe(false);
    expect(isLikelyDuplicate(nuevo(2, 300_001), [previo])).toBe(false);
    expect(isLikelyDuplicate({ ...nuevo(2), ofId: "of2" }, [previo])).toBe(false);
  });
});

describe("la ganancia no depende de los pagos", () => {
  it("computeItemUnitCost con purchaseCost=600000 da lo mismo con o sin pagos", () => {
    const item = { purchaseCost: 600_000, fulfillmentMode: "MANUFACTURE", baseCost: 500_000, additionalCost: 0 };
    const sinPagos = computeItemUnitCost(item);
    computeOfBalance({ charges: [600_000], payments: [300_000, 300_000], lineSubtotals: [600_000] });
    expect(computeItemUnitCost(item)).toBe(sinPagos);
    expect(sinPagos).toBe(600_000);
  });
});
