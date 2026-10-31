import { describe, expect, it } from "vitest";
import { planPurchaseEdit, purchaseEditTotals, purchaseStockDeltas, type ExistingPurchaseItem } from "./purchase-edit";

const item = (overrides: Partial<ExistingPurchaseItem> = {}): ExistingPurchaseItem => ({
  id: "oi1",
  productId: "p1",
  name: "Silla Laura",
  quantity: 2,
  cost: 300000,
  supplierId: "s1",
  dispatched: false,
  hasPayments: false,
  ...overrides,
});
const line = (overrides = {}) => ({ orderItemId: "oi1", productId: "p1", quantity: 2, cost: 300000, supplierId: "s1", ...overrides });

describe("planPurchaseEdit", () => {
  it("sin cambios: no se borra ninguna línea", () => {
    const plan = planPurchaseEdit([item({ dispatched: true, hasPayments: true })], [line()]);
    expect(plan.remove).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.keep).toHaveLength(1);
    expect(plan.keep[0].changed).toBe(false);
    expect(plan.error).toBeNull();
  });

  it("una línea despachada no se puede quitar", () => {
    const plan = planPurchaseEdit([item({ dispatched: true })], []);
    expect(plan.error).toMatch(/ya tiene despacho/);
  });

  it("una línea con pagos no se puede quitar ni cambiar de proveedora", () => {
    expect(planPurchaseEdit([item({ hasPayments: true })], []).error).toMatch(/tiene pagos/);
    expect(planPurchaseEdit([item({ hasPayments: true })], [line({ supplierId: "s2" })]).error).toMatch(/proveedora/);
    // Cambiar la cantidad o el costo sí se puede.
    const plan = planPurchaseEdit([item({ hasPayments: true })], [line({ quantity: 3 })]);
    expect(plan.error).toBeNull();
    expect(plan.keep[0].changed).toBe(true);
  });

  it("una línea sin id conocido o de otro producto se crea; la que no vino se quita", () => {
    const plan = planPurchaseEdit([item()], [line({ orderItemId: "nuevo" }), line({ productId: "p2" })]);
    expect(plan.create).toHaveLength(2);
    expect(plan.remove.map((r) => r.id)).toEqual(["oi1"]);
    expect(plan.error).toBeNull();
  });
});

describe("purchaseEditTotals", () => {
  it("el total conserva el flete y los costos adicionales", () => {
    expect(purchaseEditTotals({ subtotal: 600000, total: 650000 }, 600000)).toEqual({ subtotal: 600000, total: 650000 });
    expect(purchaseEditTotals({ subtotal: 600000, total: 650000 }, 900000)).toEqual({ subtotal: 900000, total: 950000 });
  });
});

describe("purchaseStockDeltas", () => {
  it("sin cambios el stock no se mueve; si cambia, solo la diferencia", () => {
    const current = new Map([["a", 2], ["b", 4]]);
    expect(purchaseStockDeltas(current, new Map([["a", 2], ["b", 4]])).size).toBe(0);
    expect(Array.from(purchaseStockDeltas(current, new Map([["a", 3], ["c", 1]])))).toEqual([
      ["a", 1],
      ["b", -4],
      ["c", 1],
    ]);
  });
});
