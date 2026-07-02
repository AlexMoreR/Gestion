import { describe, expect, it } from "vitest";
import {
  computeDianTaxThresholds,
  IVA_UVT_LIMIT,
  RENTA_UVT_LIMIT,
  resolveThresholdStatus,
} from "./dian-tax-thresholds";

const UVT = 49799;

describe("DIAN tax thresholds", () => {
  it("computes IVA and renta limits from the UVT", () => {
    const [iva, renta] = computeDianTaxThresholds(0, UVT);
    expect(iva.limitAmount).toBe(IVA_UVT_LIMIT * UVT);
    expect(renta.limitAmount).toBe(RENTA_UVT_LIMIT * UVT);
  });

  it("computes percentage and remaining for a given annual sales total", () => {
    const annualSales = 100_000_000;
    const [iva] = computeDianTaxThresholds(annualSales, UVT);
    expect(iva.percent).toBeCloseTo((annualSales / (IVA_UVT_LIMIT * UVT)) * 100, 5);
    expect(iva.remaining).toBeCloseTo(IVA_UVT_LIMIT * UVT - annualSales, 5);
    expect(iva.status).toBe("ok");
  });

  it("vender ~14M/mes deja un margen muy delgado en el tope de IVA", () => {
    // 14M x 12 = 168M vs tope 174.3M -> ~96% (banda 'danger', muy cerca).
    const [iva] = computeDianTaxThresholds(14_000_000 * 12, UVT);
    expect(iva.percent).toBeGreaterThan(90);
    expect(iva.status).toBe("danger");
  });

  it("flags renta as over well before IVA (renta tope is lower)", () => {
    const [iva, renta] = computeDianTaxThresholds(100_000_000, UVT);
    expect(renta.status).toBe("over");
    expect(iva.status).toBe("ok");
  });

  it("resolves status bands", () => {
    expect(resolveThresholdStatus(50)).toBe("ok");
    expect(resolveThresholdStatus(80)).toBe("warning");
    expect(resolveThresholdStatus(90)).toBe("danger");
    expect(resolveThresholdStatus(100)).toBe("over");
    expect(resolveThresholdStatus(130)).toBe("over");
  });

  it("guards against invalid input", () => {
    const [iva] = computeDianTaxThresholds(Number.NaN, UVT);
    expect(iva.usedAmount).toBe(0);
    expect(iva.percent).toBe(0);
  });
});
