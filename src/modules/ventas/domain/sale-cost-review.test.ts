import { describe, expect, it } from "vitest";

import { saleCostReviewReasons, type ReviewItem } from "./sale-cost-review";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  quantity: 1,
  purchaseCost: null,
  fulfillmentMode: "STOCK",
  baseCost: 300000,
  additionalCost: 20000,
  productName: "Silla Moka",
  ...over,
});

describe("saleCostReviewReasons", () => {
  it("venta bien costeada: sin motivos", () => {
    expect(saleCostReviewReasons([item()], [])).toEqual([]);
  });

  it("sin ítems ni en la orden ni en la cotización", () => {
    expect(saleCostReviewReasons([], [])).toEqual(["sin productos"]);
  });

  it("sin orden: revisa la cotización como stock", () => {
    const { purchaseCost: _p, fulfillmentMode: _f, ...quoteItem } = item({ baseCost: 0, additionalCost: 0 });
    expect(saleCostReviewReasons([], [quoteItem])).toEqual(["producto con costo 0: Silla Moka", "costo total 0"]);
  });

  it("un producto sin costo junto a otro con costo", () => {
    expect(
      saleCostReviewReasons([item(), item({ productName: "Butaco", baseCost: 0, additionalCost: 0 })], []),
    ).toEqual(["producto con costo 0: Butaco"]);
  });

  it("producto sin costo de catálogo pero con costo de compra confirmado: bien", () => {
    expect(saleCostReviewReasons([item({ baseCost: 0, additionalCost: 0, purchaseCost: 250000 })], [])).toEqual([]);
  });

  it("costo de compra confirmado en 0: costo total 0", () => {
    expect(saleCostReviewReasons([item({ purchaseCost: 0 })], [])).toEqual(["costo total 0"]);
  });
});
