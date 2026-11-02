import { describe, expect, it } from "vitest";
import { mismasLineas } from "./quote-lines";

const linea = { productId: "p1", supplierId: null, quantity: 2, unitPrice: 1000, fulfillmentMode: "STOCK", notes: "x" };

describe("mismasLineas", () => {
  it("iguales aunque cambie el orden o el precio venga como texto decimal", () => {
    const otra = { ...linea, productId: "p2" };
    expect(mismasLineas([linea, otra], [otra, { ...linea, unitPrice: { toString: () => "1000.00" } }])).toBe(true);
  });
  it("distintas si cambia cantidad, precio, nota o número de líneas", () => {
    expect(mismasLineas([linea], [{ ...linea, quantity: 3 }])).toBe(false);
    expect(mismasLineas([linea], [{ ...linea, unitPrice: 999 }])).toBe(false);
    expect(mismasLineas([linea], [{ ...linea, notes: "y" }])).toBe(false);
    expect(mismasLineas([linea], [linea, linea])).toBe(false);
  });
});
