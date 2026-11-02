import { describe, expect, it } from "vitest";
import { checkSaleItems, saleItemsErrorMessage, SALE_WITHOUT_PRODUCTS_ERROR } from "./sale-items-check";

const item = (over: Partial<{ quantity: number; baseCost: number; additionalCost: number; productName: string }> = {}) => ({
  quantity: 1,
  baseCost: 100000,
  additionalCost: 0,
  productName: "Silla Rio",
  ...over,
});

describe("checkSaleItems", () => {
  it("rechaza una venta sin ítems", () => {
    expect(checkSaleItems([])).toEqual({ ok: false, reason: "sin_productos" });
    expect(saleItemsErrorMessage([])).toBe(SALE_WITHOUT_PRODUCTS_ERROR);
  });

  it("rechaza si ningún ítem tiene cantidad", () => {
    expect(checkSaleItems([item({ quantity: 0 })])).toEqual({ ok: false, reason: "sin_productos" });
  });

  it("deja pasar productos con costo", () => {
    expect(checkSaleItems([item(), item({ baseCost: 0, additionalCost: 5000, productName: "Flete" })])).toEqual({ ok: true });
    expect(saleItemsErrorMessage([item()])).toBeNull();
  });

  it("nombra los productos con costo 0, sin repetir", () => {
    const result = checkSaleItems([
      item({ baseCost: 0, productName: "Camilla" }),
      item({ baseCost: 0, productName: "Camilla" }),
      item({ baseCost: 0, productName: "Butaco" }),
      item(),
    ]);
    expect(result).toEqual({ ok: false, reason: "sin_costo", productNames: ["Camilla", "Butaco"] });
  });

  it("ignora ítems con cantidad 0 al revisar el costo", () => {
    expect(checkSaleItems([item(), item({ quantity: 0, baseCost: 0, productName: "X" })])).toEqual({ ok: true });
  });

  it("el mensaje nombra el producto y pide cargar el costo", () => {
    const message = saleItemsErrorMessage([item({ baseCost: 0, productName: "Camilla" })]);
    expect(message).toContain("Camilla");
    expect(message).toContain("/admin/productos");
  });
});
