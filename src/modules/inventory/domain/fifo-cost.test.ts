import { describe, expect, it } from "vitest";
import { computeFifoStockCost } from "./fifo-cost";

describe("computeFifoStockCost", () => {
  it("un combo comprado a 600.000 repartido en 4 piezas suma exactamente 600.000 (sin flete)", () => {
    // Costo de cada pieza en la línea de la proveedora; el catálogo (con flete) es distinto a propósito.
    const piezas = [
      { nombre: "diván", costo: 260000.33, catalogo: 300000 },
      { nombre: "butaco", costo: 90000.33, catalogo: 110000 },
      { nombre: "carrito", costo: 120000.34, catalogo: 140000 },
      { nombre: "escalera", costo: 129999, catalogo: 150000 },
    ];
    const total = piezas.reduce((sum, pieza) => {
      const result = computeFifoStockCost({
        entries: [{ quantity: 1, unitCost: pieza.costo, purchaseCode: "ORD-00092" }],
        stockOnHand: 1,
        quantityOut: 1,
        catalogUnitCost: pieza.catalogo,
      });
      expect(result.source).toBe("ORD-00092");
      return sum + result.unitCost;
    }, 0);
    expect(Math.round(total * 100) / 100).toBe(600000);
  });

  it("una pieza sin compra sale con el costo de catálogo", () => {
    expect(
      computeFifoStockCost({ entries: [], stockOnHand: 3, quantityOut: 1, catalogUnitCost: 150000 }),
    ).toEqual({ unitCost: 150000, source: "catálogo" });
  });

  it("2 unidades de dos compras distintas dan el promedio y nombran las dos órdenes", () => {
    const result = computeFifoStockCost({
      entries: [
        { quantity: 1, unitCost: 100000, purchaseCode: "ORD-00092" },
        { quantity: 1, unitCost: 120000, purchaseCode: "ORD-00100" },
      ],
      stockOnHand: 2,
      quantityOut: 2,
      catalogUnitCost: 999999,
    });
    expect(result).toEqual({ unitCost: 110000, source: "ORD-00092 + ORD-00100" });
  });

  it("lo que queda en bodega son las unidades más nuevas: sale la más vieja de ese bloque", () => {
    const result = computeFifoStockCost({
      entries: [
        { quantity: 5, unitCost: 50000, purchaseCode: "ORD-00001" }, // ya salió todo
        { quantity: 1, unitCost: 100000, purchaseCode: "ORD-00092" },
        { quantity: 1, unitCost: 120000, purchaseCode: "ORD-00100" },
      ],
      stockOnHand: 2,
      quantityOut: 1,
      catalogUnitCost: 999999,
    });
    expect(result).toEqual({ unitCost: 100000, source: "ORD-00092" });
  });

  it("las unidades devueltas (entrada sin costo) salen a catálogo", () => {
    const result = computeFifoStockCost({
      entries: [
        { quantity: 1, unitCost: 100000, purchaseCode: "ORD-00092" },
        { quantity: 1, unitCost: null, purchaseCode: null }, // devolución por anular salida
      ],
      stockOnHand: 1,
      quantityOut: 1,
      catalogUnitCost: 150000,
    });
    expect(result).toEqual({ unitCost: 150000, source: "catálogo" });
  });

  it("si el stock supera las entradas, la diferencia es la más vieja y va a catálogo", () => {
    const result = computeFifoStockCost({
      entries: [{ quantity: 1, unitCost: 100000, purchaseCode: "COM-00007" }],
      stockOnHand: 2,
      quantityOut: 2,
      catalogUnitCost: 150000,
    });
    expect(result).toEqual({ unitCost: 125000, source: "COM-00007 + catálogo" });
  });

  it("alreadyTaken hace que la segunda pieza igual del lote tome la siguiente unidad", () => {
    const entries = [
      { quantity: 1, unitCost: 100000, purchaseCode: "ORD-00092" },
      { quantity: 1, unitCost: 120000, purchaseCode: "ORD-00100" },
    ];
    const base = { entries, stockOnHand: 2, quantityOut: 1, catalogUnitCost: 150000 };
    expect(computeFifoStockCost({ ...base, alreadyTaken: 0 })).toEqual({ unitCost: 100000, source: "ORD-00092" });
    expect(computeFifoStockCost({ ...base, alreadyTaken: 1 })).toEqual({ unitCost: 120000, source: "ORD-00100" });
    // Sin más unidades en bodega: catálogo.
    expect(computeFifoStockCost({ ...base, alreadyTaken: 2 })).toEqual({ unitCost: 150000, source: "catálogo" });
  });
});
