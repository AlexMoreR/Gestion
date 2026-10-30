import { describe, expect, it } from "vitest";
import { buildSaleProducts, type SaleItemInput } from "./sale-products";

function item(overrides: Partial<SaleItemInput> & { id: string }, product: Partial<SaleItemInput["product"]> = {}): SaleItemInput {
  return {
    quantity: 1,
    unitPrice: 200000,
    lineTotal: 200000,
    notes: null,
    fulfillmentMode: "STOCK",
    ...overrides,
    product: {
      name: `Producto ${overrides.id}`,
      code: `P-${overrides.id}`,
      thumbnailUrl: null,
      description: null,
      baseCost: 50000,
      additionalCost: 10000,
      preferredSupplierCost: null,
      ...product,
    },
  };
}

function meta(fields: Record<string, unknown>): string {
  return JSON.stringify({ _type: "quote-item-meta", ...fields });
}

describe("buildSaleProducts", () => {
  it("usa los items de la orden cuando los hay", () => {
    const result = buildSaleProducts({
      orderItems: [item({ id: "o1", purchaseCost: 100000 })],
      quoteItems: [item({ id: "q1" }), item({ id: "q2" })],
    });
    expect(result.fuente).toBe("orden");
    expect(result.productos).toHaveLength(1);
    expect(result.productos[0]).toMatchObject({ nombre: "Producto o1", codigo: "P-o1", cantidad: 1 });
  });

  it("sin items en la orden usa los de la cotizacion, con todos los campos", () => {
    const result = buildSaleProducts({
      orderItems: [],
      quoteItems: [item({ id: "q1", quantity: 2, unitPrice: 150000, lineTotal: 300000 }), item({ id: "q2" })],
    });
    expect(result.fuente).toBe("cotizacion");
    expect(result.productos).toHaveLength(2);
    expect(result.productos[0]).toEqual({
      nombre: "Producto q1",
      codigo: "P-q1",
      cantidad: 2,
      color: null,
      precio_unitario: 150000,
      total_linea: 300000,
      costo_unitario: 60000,
      costo_origen: "estimado de catálogo",
    });
  });

  it("sin productos en ningun lado", () => {
    expect(buildSaleProducts({ orderItems: [], quoteItems: [] })).toEqual({ fuente: "ninguna", productos: [] });
  });

  it("toma el color de las notas; sin color queda null", () => {
    const result = buildSaleProducts({
      orderItems: [item({ id: "a", notes: meta({ color: "Negro" }) }), item({ id: "b", notes: "nota vieja" })],
      quoteItems: [],
    });
    expect(result.productos.map((line) => line.color)).toEqual(["Negro", null]);
  });

  it("agrupa el combo en una linea con costo sumado y el peor origen", () => {
    const combo = { comboKey: "k1", comboName: "Combo Camilla", comboCode: "CB-1", comboQuantity: 1 };
    const result = buildSaleProducts({
      orderItems: [
        item({ id: "c1", lineTotal: 300000, purchaseCost: 100000, notes: meta({ ...combo, color: "Blanco" }) }),
        item({ id: "c2", lineTotal: 200000, quantity: 2, notes: meta(combo) }),
      ],
      quoteItems: [],
    });
    expect(result.productos).toHaveLength(1);
    expect(result.productos[0]).toMatchObject({
      nombre: "Combo Camilla",
      codigo: "CB-1",
      cantidad: 1,
      color: "Blanco",
      total_linea: 500000,
      costo_unitario: 220000,
      costo_origen: "estimado de catálogo",
    });
  });

  it("costo confirmado, estimado de catálogo (stock y proveedor preferido) y sin dato", () => {
    const result = buildSaleProducts({
      orderItems: [
        item({ id: "conf", purchaseCost: 100000 }),
        item({ id: "stock" }),
        item({ id: "fab", fulfillmentMode: "MANUFACTURE" }, { preferredSupplierCost: 70000 }),
        item({ id: "cero" }, { baseCost: 0, additionalCost: 0 }),
      ],
      quoteItems: [],
    });
    expect(result.productos.map((line) => [line.costo_unitario, line.costo_origen])).toEqual([
      [100000, "confirmado"],
      [60000, "estimado de catálogo"],
      [70000, "estimado de catálogo"],
      [0, "sin dato"],
    ]);
  });
});
