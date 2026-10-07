import { describe, expect, it } from "vitest";

import { groupByMonth, metaAdsWithoutAd, type OriginReportSale, summarizeByAd, summarizeByOrigin } from "./sale-origin-report";

function sale(partial: Partial<OriginReportSale> & { amount: number }): OriginReportSale {
  return {
    saleId: Math.random().toString(36).slice(2),
    recognizedAt: new Date("2026-09-15T12:00:00Z"),
    profit: partial.amount / 2,
    origin: null,
    originDetail: null,
    ...partial,
  };
}

describe("summarizeByOrigin", () => {
  it("agrupa por origen, calcula ticket y deja Sin dato siempre visible", () => {
    const rows = summarizeByOrigin([
      sale({ amount: 1_000_000, origin: "META_ADS" }),
      sale({ amount: 3_000_000, origin: "META_ADS" }),
      sale({ amount: 1_000_000, origin: "MARKETPLACE" }),
    ]);
    expect(rows.map((row) => row.origin)).toEqual(["META_ADS", "MARKETPLACE", "SIN_DATO"]);
    expect(rows[0]).toMatchObject({ count: 2, revenue: 4_000_000, averageTicket: 2_000_000, revenueShare: 80 });
    expect(rows[2]).toMatchObject({ count: 0, revenue: 0, averageTicket: 0 });
  });

  it("null cuenta como Sin dato", () => {
    const rows = summarizeByOrigin([sale({ amount: 500_000 }), sale({ amount: 500_000, origin: "SIN_DATO" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: "SIN_DATO", count: 2, revenue: 1_000_000 });
  });
});

describe("groupByMonth", () => {
  it("mes por fecha de entrega en UTC, del mas reciente al mas viejo", () => {
    const months = groupByMonth([
      sale({ amount: 1, recognizedAt: new Date("2026-08-31T23:00:00Z") }),
      sale({ amount: 2, recognizedAt: new Date("2026-09-01T00:00:00Z") }),
      sale({ amount: 3, recognizedAt: new Date("2026-09-20T00:00:00Z") }),
    ]);
    expect(months.map((month) => month.month)).toEqual(["2026-09", "2026-08"]);
    expect(months[0].totals).toMatchObject({ count: 2, revenue: 5 });
  });
});

describe("por anuncio", () => {
  it("agrupa por id de anuncio y aparta Meta Ads sin anuncio", () => {
    const sales = [
      sale({ amount: 100, origin: "META_ADS", originDetail: { adId: "A1", adTitle: "Combo negro" } }),
      sale({ amount: 300, origin: "META_ADS", originDetail: { adId: "A1" } }),
      sale({ amount: 50, origin: "META_ADS", originDetail: { adId: "A2", adTitle: "Camilla" } }),
      sale({ amount: 70, origin: "META_ADS", originDetail: { linea: "Ventas 1" } }),
      sale({ amount: 90, origin: "MARKETPLACE", originDetail: { mkCuenta: "MK-1" } }),
    ];
    const ads = summarizeByAd(sales);
    expect(ads.map((ad) => ad.key)).toEqual(["A1", "A2"]);
    expect(ads[0]).toMatchObject({ adTitle: "Combo negro", count: 2, revenue: 400, averageTicket: 200 });
    expect(metaAdsWithoutAd(sales)).toMatchObject({ count: 1, revenue: 70 });
  });
});
