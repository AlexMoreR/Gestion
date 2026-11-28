import { describe, expect, it } from "vitest";
import {
  coincideBusqueda,
  origenDeMovimiento,
  resumirInventario,
  type InventoryMovementRow,
  type InventoryProductRow,
} from "./inventory-view";

const base = { type: "IN" as const, change: 1, note: null, purchaseCode: null, sourceOrderItemId: null };

describe("origenDeMovimiento", () => {
  it("venta anulada con el código de su orden, aunque tenga compra o nota", () => {
    expect(
      origenDeMovimiento({ ...base, sourceOrderItemId: "oi1", ordenAnulada: "ORD-00119", purchaseCode: "COM-00003" }),
    ).toEqual({ tipo: "venta anulada", referencia: "ORD-119" });
    expect(origenDeMovimiento({ ...base, sourceOrderItemId: "oi1" })).toEqual({ tipo: "venta anulada", referencia: null });
  });

  it("compra COM", () => {
    expect(origenDeMovimiento({ ...base, purchaseCode: "COM-00012", note: "SAL-00001" })).toEqual({
      tipo: "compra",
      referencia: "COM-12",
    });
  });

  it("código dentro de la nota", () => {
    expect(origenDeMovimiento({ ...base, type: "OUT", change: -1, note: "Salida por venta SAL-00081" })).toEqual({
      tipo: "venta",
      referencia: "SAL-81",
    });
    expect(origenDeMovimiento({ ...base, note: "of-35 lista" })).toEqual({ tipo: "orden de fabricación", referencia: "OF-35" });
  });

  it("devolución", () => {
    expect(origenDeMovimiento({ ...base, note: "Devolución de la ORD-00095" })).toEqual({
      tipo: "devolución",
      referencia: "ORD-95",
    });
    expect(origenDeMovimiento({ ...base, note: "producto devuelto" })).toEqual({ tipo: "devolución", referencia: null });
  });

  it("ajuste manual y sin dato", () => {
    expect(origenDeMovimiento({ ...base, type: "ADJUSTMENT", change: -2, note: "conteo" })).toEqual({
      tipo: "ajuste manual",
      referencia: null,
    });
    expect(origenDeMovimiento({ ...base, note: "inventario inicial" })).toEqual({ tipo: "sin dato", referencia: null });
  });
});

const silla: InventoryProductRow = { id: "p1", code: "SIL-01", name: "Silla Barbería Clásica", costoUnitario: 500_000, costoFuente: "ORD-00092" };
const camilla: InventoryProductRow = { id: "p2", code: "CAM-02", name: "Camilla", costoUnitario: 300_000, costoFuente: "catálogo" };

function mov(productId: string, change: number, day: number): InventoryMovementRow {
  return {
    ...base,
    productId,
    type: change < 0 ? "OUT" : "IN",
    change,
    movementDate: new Date(Date.UTC(2026, 9, 1, 15) + day * 60_000),
    persona: "Ingrid",
  };
}

describe("resumirInventario", () => {
  it("stock = suma de los movimientos, aviso de negativo y lista del más nuevo al más viejo", () => {
    const [s, c] = resumirInventario([silla, camilla], [mov("p1", 3, 0), mov("p1", -1, 1), mov("p2", -2, 0)], [], {
      conMovimientos: true,
    });
    expect(s).toMatchObject({ codigo: "SIL-01", stock: 2, stock_negativo: null, costo_unitario: 500_000, costo_fuente: "ORD-00092" });
    expect(c.stock).toBe(-2);
    expect(c.stock_negativo).toContain("-2");
    if (!("movimientos" in s)) throw new Error("faltan movimientos");
    expect(s.movimientos.map((m) => m.cantidad)).toEqual([-1, 3]);
    expect(s.movimientos[1]).toEqual({
      fecha: "2026-10-01 10:00",
      persona: "Ingrid",
      tipo: "entrada",
      cantidad: 3,
      origen: "sin dato",
      referencia: null,
      nota: null,
    });
    expect(s.movimientos_cortado).toBe(false);
  });

  it("corta en 100 movimientos por producto", () => {
    const muchos = Array.from({ length: 105 }, (_, i) => mov("p1", 1, i));
    const [s] = resumirInventario([silla], muchos, [], { conMovimientos: true });
    if (!("movimientos" in s)) throw new Error("faltan movimientos");
    expect(s.stock).toBe(105);
    expect(s.movimientos).toHaveLength(100);
    expect(s.movimientos_cortado).toBe(true);
  });

  it("cuenta el lote por ubicación y estado, con lo que no tiene ubicación registrada", () => {
    const lote = [
      { productId: "p1", estado: "EN_INVENTARIO", ubicacion: "CALI" },
      { productId: "p1", estado: "FABRICANDO", ubicacion: "TALLER_PROVEEDORA" },
      { productId: "p1", estado: "PENDIENTE", ubicacion: null },
      { productId: "p1", estado: "VENDIDA", ubicacion: "CALI" },
      { productId: "p2", estado: "EN_INVENTARIO", ubicacion: "CALI" },
    ];
    const [s, c] = resumirInventario([silla, camilla], [mov("p1", 3, 0)], lote, { conMovimientos: false });
    expect(s.ubicacion).toEqual({
      unidades_de_lote: 4,
      por_ubicacion: { CALI: 1, TALLER_PROVEEDORA: 1, sin_dato: 1 },
      por_estado: { PENDIENTE: 1, FABRICANDO: 1, EN_INVENTARIO: 1, VENDIDA: 1 },
      sin_ubicacion_registrada: 2,
    });
    expect(c.ubicacion.sin_ubicacion_registrada).toBe(0);
  });

  it("sin movimientos no trae la lista", () => {
    const [s] = resumirInventario([silla], [mov("p1", 1, 0)], [], { conMovimientos: false });
    expect(s).not.toHaveProperty("movimientos");
    expect(s).not.toHaveProperty("movimientos_cortado");
    expect(s.stock).toBe(1);
  });
});

describe("coincideBusqueda", () => {
  it("por nombre sin tildes ni mayúsculas y por código", () => {
    expect(coincideBusqueda(silla, "BARBERIA")).toBe(true);
    expect(coincideBusqueda(silla, "sil-01")).toBe(true);
    expect(coincideBusqueda(silla, "camilla")).toBe(false);
  });
});
