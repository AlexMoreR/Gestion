import { describe, expect, it } from "vitest";
import { stringifyQuoteItemMeta } from "../../../lib/quote-item-meta";
import { buildSaleProducts, type SaleProductItemInput } from "./sale-products";

function item(
  overrides: Partial<Omit<SaleProductItemInput, "product">> & { product?: Partial<SaleProductItemInput["product"]> } = {},
) {
  const { product, ...rest } = overrides;
  return {
    id: "i1",
    quantity: 1,
    unitPrice: 200000,
    lineTotal: 200000,
    notes: null,
    fulfillmentMode: "STOCK",
    purchaseCost: null,
    ...rest,
    product: {
      name: "Silla Barbera",
      code: "SB-01",
      thumbnailUrl: null,
      description: null,
      baseCost: 0,
      additionalCost: 0,
      preferredSupplierCost: null,
      ...product,
    },
  } satisfies SaleProductItemInput;
}

describe("buildSaleProducts", () => {
  it("usa los items de la orden cuando los hay", () => {
    const result = buildSaleProducts({
      orderItems: [item({ id: "o1", product: { name: "De la orden" } })],
      quoteItems: [item({ id: "q1", product: { name: "De la cotizacion" } })],
    });
    expect(result.fuente).toBe("orden");
    expect(result.productos.map((p) => p.nombre)).toEqual(["De la orden"]);
  });

  it("sin orden o con la orden vacia usa la cotizacion con todos los campos", () => {
    const quoteItems = [
      item({ id: "q1", quantity: 2, unitPrice: 100000, lineTotal: 200000, product: { name: "Camilla", code: "CA-1" } }),
      item({ id: "q2", product: { name: "Butaco", code: "BU-1" } }),
    ];
    for (const orderItems of [null, []]) {
      const result = buildSaleProducts({ orderItems, quoteItems });
      expect(result.fuente).toBe("cotizacion");
      expect(result.productos).toHaveLength(2);
      expect(result.productos[0]).toEqual({
        nombre: "Camilla",
        codigo: "CA-1",
        cantidad: 2,
        color: null,
        precio_unitario: 100000,
        total_linea: 200000,
        costo_unitario: 0,
        costo_origen: "sin dato",
      });
    }
  });

  it("sin productos en ningun lado devuelve ninguna", () => {
    expect(buildSaleProducts({ orderItems: [], quoteItems: undefined })).toEqual({ fuente: "ninguna", productos: [] });
  });

  it("toma el color de las notas; sin color queda null", () => {
    const result = buildSaleProducts({
      orderItems: [
        item({ id: "a", notes: stringifyQuoteItemMeta({ color: "Negro" }) }),
        item({ id: "b", notes: "texto viejo sin color" }),
      ],
      quoteItems: null,
    });
    expect(result.productos.map((p) => p.color)).toEqual(["Negro", null]);
  });

  it("agrupa el combo en una linea, suma el costo y toma el peor origen", () => {
    const combo = { comboKey: "k1", comboName: "Combo Camilla", comboCode: "CB-1", comboQuantity: 1 };
    const result = buildSaleProducts({
      orderItems: [
        item({
          id: "c1",
          lineTotal: 300000,
          purchaseCost: 100000,
          notes: stringifyQuoteItemMeta({ ...combo, color: "Blanco" }),
        }),
        item({
          id: "c2",
          quantity: 2,
          lineTotal: 200000,
          notes: stringifyQuoteItemMeta(combo),
          product: { baseCost: 20000, additionalCost: 5000 },
        }),
      ],
      quoteItems: null,
    });
    expect(result.productos).toEqual([
      {
        nombre: "Combo Camilla",
        codigo: "CB-1",
        cantidad: 1,
        color: "Blanco",
        precio_unitario: 500000,
        total_linea: 500000,
        costo_unitario: 150000,
        costo_origen: "estimado de catálogo",
      },
    ]);
  });

  it("costo confirmado, estimado de catalogo y sin dato", () => {
    const result = buildSaleProducts({
      orderItems: [
        item({ id: "a", purchaseCost: 100000, product: { baseCost: 1 } }),
        item({ id: "b", product: { baseCost: 50000, additionalCost: 10000 } }),
        item({ id: "c", fulfillmentMode: "MANUFACTURE", product: { baseCost: 50000, preferredSupplierCost: 70000 } }),
        item({ id: "d" }),
        item({ id: "e", purchaseCost: 0, product: { baseCost: 50000 } }),
      ],
      quoteItems: null,
    });
    expect(result.productos.map((p) => [p.costo_unitario, p.costo_origen])).toEqual([
      [100000, "confirmado"],
      [60000, "estimado de catálogo"],
      [70000, "estimado de catálogo"],
      [0, "sin dato"],
      [0, "sin dato"],
    ]);
  });
});
