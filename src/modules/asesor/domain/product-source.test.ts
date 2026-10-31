import { describe, expect, it } from "vitest";
import { describeProductSource, type ProductSourceLine } from "./product-source";

const line = (over: Partial<ProductSourceLine>): ProductSourceLine => ({
  productName: "Silla X",
  quantity: 1,
  fulfillmentMode: "STOCK",
  supplierId: null,
  supplierName: null,
  ...over,
});

describe("describeProductSource", () => {
  it("todo de stock", () => {
    expect(describeProductSource({ lines: [line({}), line({ productName: "Butaco" })], manufacturingOrders: [] })).toEqual({
      tipo: "stock",
      ordenes_fabricacion: [],
    });
  });

  it("fabricacion con OF y proveedora", () => {
    const result = describeProductSource({
      lines: [line({ fulfillmentMode: "MANUFACTURE", supplierId: "s1", supplierName: "Fabrica Y", quantity: 2 })],
      manufacturingOrders: [{ code: "OF-00012", supplierId: "s1" }],
    });
    expect(result).toEqual({
      tipo: "fabricacion",
      ordenes_fabricacion: [{ of: "OF-00012", proveedora: "Fabrica Y", productos: ["Silla X x2"] }],
    });
  });

  it("mixto: una linea de stock y otra de fabricacion", () => {
    const result = describeProductSource({
      lines: [
        line({ productName: "Butaco" }),
        line({ fulfillmentMode: "MANUFACTURE", supplierId: "s1", supplierName: "Fabrica Y" }),
      ],
      manufacturingOrders: [],
    });
    expect(result.tipo).toBe("mixto");
    // Sin OF creada todavia.
    expect(result.ordenes_fabricacion).toEqual([{ of: null, proveedora: "Fabrica Y", productos: ["Silla X x1"] }]);
  });

  it("mixto: una sola linea marcada como Mixto", () => {
    expect(describeProductSource({ lines: [line({ fulfillmentMode: "MIXED" })], manufacturingOrders: [] }).tipo).toBe(
      "mixto",
    );
  });

  it("fabricacion sin proveedora confirmada", () => {
    expect(
      describeProductSource({ lines: [line({ fulfillmentMode: "MANUFACTURE" })], manufacturingOrders: [] }),
    ).toEqual({
      tipo: "fabricacion",
      ordenes_fabricacion: [{ of: null, proveedora: null, productos: ["Silla X x1"] }],
    });
  });

  it("venta sin orden", () => {
    expect(describeProductSource({ lines: null, manufacturingOrders: [] })).toEqual({
      tipo: "sin_orden",
      ordenes_fabricacion: [],
    });
  });
});
