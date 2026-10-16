import { describe, expect, it } from "vitest";
import { buildPortalQuotes, estimateQuoteCommission, explainSaleLine, nextSaleRate, ruleText } from "./seller-portal";

const money = (value: number) => `$${value.toLocaleString("es-CO")}`;

describe("seller portal", () => {
  it("tasa de la proxima venta", () => {
    expect(nextSaleRate(0, null)).toBe(0.1);
    expect(nextSaleRate(2, null)).toBe(0.15);
    expect(nextSaleRate(0, 0.15)).toBe(0.15);
  });

  it("comision estimada de una cotizacion; sin ganancia no promete nada", () => {
    expect(estimateQuoteCommission(1_029_000, 760_000, 0.15)).toBe(40_350);
    expect(estimateQuoteCommission(500_000, 600_000, 0.15)).toBe(0);
  });

  it("explica cada venta sin mostrar costos", () => {
    const text = explainSaleLine(
      { saleCode: "SAL-1", day: "2026-10-15", clientName: null, saleAmount: 1_029_000, profit: 269_000, ratePct: 15, commission: 40_350, pendingDelivery: false, noCommission: false },
      money,
    );
    expect(text).toContain("15%");
    expect(text).toContain("40.350");
  });

  it("regla en lenguaje claro", () => {
    expect(ruleText(15)).toContain("15% de la ganancia de cada venta");
    expect(ruleText(null)).toContain("primera venta del mes");
  });

  it("arma las cotizaciones con su estado", () => {
    const [line] = buildPortalQuotes(
      [{ quoteCode: "COT-1", createdAt: new Date("2026-10-14T15:00:00Z"), clientName: "Ana", status: "SENT", total: 450_000, estimatedCost: 235_000, products: ["Diván"] }],
      0.15,
    );
    expect(line).toMatchObject({ statusLabel: "Enviada", estimatedCommission: 32_250, day: "2026-10-14" });
  });
});
