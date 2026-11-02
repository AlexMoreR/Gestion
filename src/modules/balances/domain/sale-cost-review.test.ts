import { describe, expect, it } from "vitest";

import { saleCostIssues } from "./sale-cost-review";

const item = { name: "Silla", quantity: 1, purchaseCost: null, fulfillmentMode: "STOCK", baseCost: 300000, additionalCost: 20000 };

describe("saleCostIssues", () => {
  it("venta bien: sin motivos", () => {
    expect(saleCostIssues([item], [])).toEqual([]);
  });

  it("sin orden ni cotizacion con productos", () => {
    expect(saleCostIssues(null, [])).toEqual(["sin productos (ni en la orden ni en la cotizacion)"]);
  });

  it("sin orden: mira la cotizacion", () => {
    expect(saleCostIssues([], [{ name: "Camilla", quantity: 2, baseCost: 0, additionalCost: 0 }])).toEqual([
      "producto con costo 0: Camilla",
      "costo total 0",
    ]);
  });

  it("un producto en 0 con otro con costo: no es costo total 0", () => {
    expect(saleCostIssues([item, { ...item, name: "Butaco", baseCost: 0, additionalCost: 0 }], [])).toEqual([
      "producto con costo 0: Butaco",
    ]);
  });

  it("con purchaseCost no se marca aunque el catalogo este en 0", () => {
    expect(saleCostIssues([{ ...item, purchaseCost: 250000, baseCost: 0, additionalCost: 0 }], [])).toEqual([]);
  });

  it("purchaseCost confirmado en 0: costo total 0", () => {
    expect(saleCostIssues([{ ...item, purchaseCost: 0 }], [])).toEqual(["costo total 0"]);
  });
});
