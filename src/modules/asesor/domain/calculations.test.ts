import { describe, expect, it } from "vitest";
import {
  AsesorInputError,
  buildDayRange,
  buildMonthRange,
  computeCommissions,
  currentMonthInBogota,
  describeRange,
  productMargin,
  summarizeMonth,
  summarizeQuotes,
} from "./calculations";
import type { QuoteRow } from "./entities";

const ana = { id: "u-ana", name: "Ana" };
const bea = { id: "u-bea", name: "Bea" };

describe("fechas", () => {
  it("convierte un rango inclusivo en semiabierto UTC", () => {
    const range = buildDayRange("2026-09-01", "2026-09-30");
    expect(range.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(describeRange(range)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });

  it("rechaza formatos, fechas imposibles y rangos invertidos", () => {
    expect(() => buildDayRange("01/09/2026", "2026-09-30")).toThrow(AsesorInputError);
    expect(() => buildDayRange("2026-02-30", "2026-03-01")).toThrow(AsesorInputError);
    expect(() => buildDayRange("2026-09-10", "2026-09-01")).toThrow(AsesorInputError);
  });

  it("arma el mes con la convencion de Balances", () => {
    const range = buildMonthRange(12, 2026);
    expect(range.from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(() => buildMonthRange(13, 2026)).toThrow(AsesorInputError);
  });

  it("toma el mes en curso en hora de Colombia", () => {
    // 1 oct 2026 02:00 UTC = 30 sep 2026 21:00 en Bogota.
    expect(currentMonthInBogota(new Date("2026-10-01T02:00:00Z"))).toEqual({ mes: 9, anio: 2026 });
  });
});

describe("resumen del mes", () => {
  it("calcula contribucion y ticket promedio desde las metricas de Balances", () => {
    const summary = summarizeMonth({
      salesCount: 4,
      salesTotal: 10_000_000,
      supplierCosts: 6_000_000,
      shippingCosts: 400_000,
      netProfit: 3_600_000,
      marginPercentage: 36,
      profitableSalesCount: 4,
      bestSale: null,
      worstSale: null,
    });
    expect(summary).toEqual({
      pedidos: 4,
      ingresos: 10_000_000,
      costo_producto: 6_000_000,
      fletes: 400_000,
      contribucion: 3_600_000,
      contribucion_pct: 36,
      ticket_promedio: 2_500_000,
    });
  });

  it("no divide entre cero sin ventas", () => {
    const summary = summarizeMonth({
      salesCount: 0,
      salesTotal: 0,
      supplierCosts: 0,
      shippingCosts: 0,
      netProfit: 0,
      marginPercentage: 0,
      profitableSalesCount: 0,
      bestSale: null,
      worstSale: null,
    });
    expect(summary.ticket_promedio).toBe(0);
  });
});

describe("comisiones", () => {
  it("paga 10% la primera venta del mes y 15% las siguientes, por fecha de entrega", () => {
    const report = computeCommissions([
      { saleCode: "SAL-3", deliveredAt: new Date("2026-09-20T00:00:00Z"), seller: ana, profit: 1_000_000 },
      { saleCode: "SAL-1", deliveredAt: new Date("2026-09-05T00:00:00Z"), seller: ana, profit: 2_000_000 },
      { saleCode: "SAL-2", deliveredAt: new Date("2026-09-10T00:00:00Z"), seller: bea, profit: 500_000 },
    ]);

    const anaReport = report.vendedoras.find((seller) => seller.vendedora === "Ana");
    expect(anaReport?.detalle.map((line) => [line.venta, line.tasa_pct, line.comision])).toEqual([
      ["SAL-1", 10, 200_000],
      ["SAL-3", 15, 150_000],
    ]);
    expect(anaReport?.comision_total).toBe(350_000);

    const beaReport = report.vendedoras.find((seller) => seller.vendedora === "Bea");
    expect(beaReport?.comision_total).toBe(50_000);
    expect(report.totales).toEqual({ ventas: 3, ganancia_total: 3_500_000, comision_total: 400_000 });
    expect(report.sin_asignar).toBeNull();
  });

  it("una venta con perdida cuenta en el orden pero no genera comision", () => {
    const report = computeCommissions([
      { saleCode: "SAL-1", deliveredAt: new Date("2026-09-01T00:00:00Z"), seller: ana, profit: -100_000 },
      { saleCode: "SAL-2", deliveredAt: new Date("2026-09-02T00:00:00Z"), seller: ana, profit: 1_000_000 },
    ]);
    const lines = report.vendedoras[0].detalle;
    expect(lines[0]).toMatchObject({ comision: 0, tasa_pct: 10 });
    expect(lines[0].nota).toBeDefined();
    expect(lines[1]).toMatchObject({ comision: 150_000, tasa_pct: 15 });
  });

  it("separa las ventas sin vendedora como 'sin asignar' sin comision", () => {
    const report = computeCommissions([
      { saleCode: "SAL-9", deliveredAt: new Date("2026-09-01T00:00:00Z"), seller: null, profit: 800_000 },
    ]);
    expect(report.vendedoras).toHaveLength(0);
    expect(report.sin_asignar).toMatchObject({ vendedora: "sin asignar", ventas: 1, ganancia_total: 800_000 });
    expect(report.totales.comision_total).toBe(0);
  });
});

describe("cotizaciones", () => {
  const base: Omit<QuoteRow, "quoteCode" | "status" | "total" | "saleCode"> = {
    createdAt: new Date("2026-09-01T00:00:00Z"),
    clientName: "Cliente",
    seller: ana,
  };

  it("cuenta como aprobadas las convertidas en venta y calcula el % de cierre", () => {
    const summary = summarizeQuotes([
      { ...base, quoteCode: "COT-1", status: "ACCEPTED", total: 1_000_000, saleCode: "SAL-1" },
      { ...base, quoteCode: "COT-2", status: "DRAFT", total: 500_000, saleCode: null },
      { ...base, quoteCode: "COT-3", status: "SENT", total: 500_000, saleCode: null },
      { ...base, quoteCode: "COT-4", status: "DRAFT", total: 2_000_000, saleCode: "SAL-2" },
    ]);
    expect(summary).toMatchObject({
      hechas: 4,
      aprobadas: 2,
      pct_cierre: 50,
      valor_cotizado: 4_000_000,
      valor_aprobado: 3_000_000,
    });
    expect(summary.por_estado).toEqual({ "Aceptada": 1, "Revisión": 2, "Enviada": 1 });
  });

  it("sin cotizaciones el cierre es 0", () => {
    expect(summarizeQuotes([]).pct_cierre).toBe(0);
  });
});

describe("margen de producto", () => {
  it("resta el flete del margen real", () => {
    const margin = productMargin({
      code: "CAV04",
      name: "Camilla",
      categoryName: "CAMILLA",
      price: 659_000,
      baseCost: 400_000,
      additionalCost: 59_000,
      isBundle: false,
      hiddenFromStore: false,
    });
    expect(margin).toEqual({
      costo_total: 459_000,
      ganancia_unitaria: 200_000,
      margen_sobre_precio_pct: 30.35,
      margen_sobre_costo_pct: 43.57,
    });
  });
});
