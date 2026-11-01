import { describe, expect, it } from "vitest";
import { stringifyQuoteItemMeta } from "../../../lib/quote-item-meta";
import {
  buildQuoteProductSummary,
  buildSaleLinks,
  buildSaleProducts,
  MISSING_MANUFACTURING_NOTICE,
  MISSING_ORDER_NOTICE,
  type SaleProductItemInput,
} from "./sale-products";

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

describe("buildSaleLinks", () => {
  const siteUrl = "https://magilus.com/";
  const of1 = { code: "OF-001", supplierName: "Tapicería Ana", shareToken: "tok-of1" };
  const of2 = { code: "OF-002", supplierName: "Metales Luz", shareToken: "tok-of2" };

  it("arma los links de cotizacion, venta y una proveedora", () => {
    expect(
      buildSaleLinks({ siteUrl, quoteShareToken: "tok-q", invoiceToken: "tok-s", hasOrder: true, manufacturingOrders: [of1] }),
    ).toEqual({
      link_cotizacion: "https://magilus.com/cotizaciones/tok-q",
      link_venta: "https://magilus.com/sales/tok-s",
      link_proveedora: { proveedora: "Tapicería Ana", orden_fabricacion: "OF-001", link: "https://magilus.com/fabricacion/tok-of1" },
      aviso_orden: null,
      aviso_proveedora: null,
    });
  });

  it("devuelve una lista si hay varias proveedoras", () => {
    const links = buildSaleLinks({ siteUrl, quoteShareToken: null, invoiceToken: "s", hasOrder: true, manufacturingOrders: [of1, of2] });
    expect(links.link_proveedora).toEqual([
      { proveedora: "Tapicería Ana", orden_fabricacion: "OF-001", link: "https://magilus.com/fabricacion/tok-of1" },
      { proveedora: "Metales Luz", orden_fabricacion: "OF-002", link: "https://magilus.com/fabricacion/tok-of2" },
    ]);
    expect(links.link_cotizacion).toBeNull();
  });

  it("avisa 'Falta crear la orden' cuando la venta no tiene orden", () => {
    const links = buildSaleLinks({ siteUrl, quoteShareToken: null, invoiceToken: null, hasOrder: false, manufacturingOrders: [] });
    expect(links).toEqual({
      link_cotizacion: null,
      link_venta: null,
      link_proveedora: null,
      aviso_orden: MISSING_ORDER_NOTICE,
      aviso_proveedora: null,
    });
    expect(MISSING_ORDER_NOTICE).toBe("Falta crear la orden");
  });

  it("avisa cuando hay orden pero ninguna orden de fabricacion", () => {
    const links = buildSaleLinks({ siteUrl, quoteShareToken: "q", invoiceToken: "s", hasOrder: true, manufacturingOrders: [] });
    expect(links.link_proveedora).toBeNull();
    expect(links.aviso_orden).toBeNull();
    expect(links.aviso_proveedora).toBe(MISSING_MANUFACTURING_NOTICE);
  });
});

describe("buildQuoteProductSummary", () => {
  it("agrupa combos y trae nombre, codigo, color y cantidad", () => {
    const combo = stringifyQuoteItemMeta({ comboKey: "c1", comboName: "Combo Barbero", color: "Negro" });
    const result = buildQuoteProductSummary([
      item({ id: "a", notes: stringifyQuoteItemMeta({ color: "Rojo" }) }),
      item({ id: "b", notes: combo, product: { name: "Hijo 1", code: "H1" } }),
      item({ id: "c", notes: combo, product: { name: "Hijo 2", code: "H2" } }),
    ]);
    expect(result[0]).toEqual({ nombre: "Silla Barbera", codigo: "SB-01", color: "Rojo", cantidad: 1 });
    expect(result).toHaveLength(2);
    expect(result[1].color).toBe("Negro");
  });
});
