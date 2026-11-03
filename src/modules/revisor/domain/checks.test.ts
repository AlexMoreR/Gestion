import { describe, expect, it } from "vitest";

import {
  revisarBorrados,
  revisarCompras,
  revisarCuentasNegativas,
  revisarNumeracion,
  revisarProveedoras,
  revisarSalidasStock,
  revisarSaltosDeSaldo,
  revisarStockNegativo,
  revisarVentas,
  type MovimientoProveedora,
} from "./checks";

describe("revisarVentas", () => {
  it("marca la pagada con saldo y la pagada sin marcar; ignora las que cuadran", () => {
    const hallazgos = revisarVentas([
      { codigo: "SAL-00001", estado: "INVOICED", total: 100_000, pagado: 60_000 },
      { codigo: "SAL-00002", estado: "ACTIVE", total: 100_000, pagado: 100_000 },
      { codigo: "SAL-00003", estado: "INVOICED", total: 100_000, pagado: 100_000 },
      { codigo: "SAL-00004", estado: "ACTIVE", total: 100_000, pagado: 10_000 },
      { codigo: "SAL-00005", estado: "CANCELLED", total: 100_000, pagado: 0 },
    ]);
    expect(hallazgos.map((h) => [h.tipo, h.codigo, h.esPlata])).toEqual([
      ["VENTA_PAGADA_CON_SALDO", "SAL-00001", true],
      ["VENTA_PAGADA_SIN_MARCAR", "SAL-00002", true],
    ]);
  });
});

describe("revisarProveedoras", () => {
  const base: MovimientoProveedora = {
    id: "x",
    codigo: null,
    tipo: "PAYMENT",
    monto: 50_000,
    nota: null,
    proveedora: "Rosa",
    orderId: null,
    orderItemId: null,
    inventoryMovementId: null,
    dispatchId: null,
    settlesEntryId: null,
  };
  it("solo marca lo que iba a una orden que ya no está", () => {
    const hallazgos = revisarProveedoras([
      { ...base, id: "a", nota: "Pago a proveedor - Orden ORD-00012" },
      { ...base, id: "b", tipo: "CHARGE", orderItemId: "item" },
      { ...base, id: "c", orderId: "orden", nota: "Pago a proveedor - Orden ORD-00013" },
      { ...base, id: "d", nota: "Abono manual" },
      { ...base, id: "e", inventoryMovementId: "mov", orderItemId: "item" },
    ]);
    expect(hallazgos.map((h) => [h.tipo, h.codigo])).toEqual([
      ["PAGO_PROVEEDORA_SIN_ORDEN", "a"],
      ["CARGO_PROVEEDORA_SIN_ORDEN", "b"],
    ]);
  });
});

describe("revisarStockNegativo", () => {
  it("marca solo el stock bajo cero", () => {
    const hallazgos = revisarStockNegativo([
      { codigo: "P1", nombre: "Silla", stock: -2 },
      { codigo: "P2", nombre: "Camilla", stock: 0 },
    ]);
    expect(hallazgos).toEqual([{ tipo: "STOCK_NEGATIVO", codigo: "P1", detalle: "Silla tiene stock -2", esPlata: false }]);
  });
});

describe("revisarSalidasStock", () => {
  const item = { orden: "ORD-00010", estadoOrden: "RELEASED", productId: "p1", producto: "Silla", cantidad: 2, confirmado: true };
  it("marca lo confirmado o entregado sin su salida completa", () => {
    const hallazgos = revisarSalidasStock(
      [
        item,
        { ...item, orden: "ORD-00011" },
        { ...item, orden: "ORD-00012", confirmado: false, estadoOrden: "COMPLETED" },
        { ...item, orden: "ORD-00013", confirmado: false },
        { ...item, orden: "ORD-00014", estadoOrden: "CANCELLED" },
      ],
      new Map([
        ["ORD-00010|p1", 2],
        ["ORD-00011|p1", 1],
      ]),
    );
    expect(hallazgos.map((h) => h.codigo)).toEqual(["ORD-00011", "ORD-00012"]);
  });
});

describe("revisarCompras", () => {
  const compra = {
    orden: "ORD-00020",
    codigoCompra: "COM-00003",
    estado: "RELEASED",
    recibida: false,
    items: [{ productId: "p1", producto: "Silla", cantidad: 3 }],
    entradas: new Map([["p1", 3]]),
  };
  it("compra que cuadra no da hallazgos", () => {
    expect(revisarCompras([compra])).toEqual([]);
  });
  it("sin entrada, cantidad distinta, recibida sin completar; anulada no cuenta", () => {
    const hallazgos = revisarCompras([
      { ...compra, codigoCompra: "COM-00004", entradas: new Map() },
      { ...compra, codigoCompra: "COM-00005", entradas: new Map([["p1", 2]]) },
      { ...compra, codigoCompra: "COM-00006", recibida: true },
      { ...compra, codigoCompra: "COM-00007", recibida: true, estado: "COMPLETED" },
      { ...compra, codigoCompra: "COM-00008", estado: "CANCELLED", entradas: new Map() },
    ]);
    expect(hallazgos.map((h) => [h.tipo, h.codigo])).toEqual([
      ["COMPRA_SIN_ENTRADA", "COM-00004"],
      ["COMPRA_CANTIDAD_DISTINTA", "COM-00005"],
      ["COMPRA_RECIBIDA_SIN_COMPLETAR", "COM-00006"],
    ]);
  });
  it("compra por lote: 6 con 3 pendientes y 3 entradas no da hallazgos; todo pendiente no es sin entrada", () => {
    const lote = { ...compra, items: [{ productId: "p1", producto: "Silla", cantidad: 6 }], pendientes: new Map([["p1", 3]]) };
    expect(revisarCompras([lote])).toEqual([]);
    expect(revisarCompras([{ ...lote, entradas: new Map(), pendientes: new Map([["p1", 6]]) }])).toEqual([]);
    expect(revisarCompras([{ ...lote, entradas: new Map([["p1", 2]]) }]).map((h) => h.tipo)).toEqual([
      "COMPRA_CANTIDAD_DISTINTA",
    ]);
  });
});

describe("revisarBorrados", () => {
  it("marca solo lo borrado de verdad y sin copia en anulados", () => {
    const base = { entityType: "SALE", entityId: "s1", entityCode: "SAL-00009", resumen: "Borró la venta", existe: false, anulado: false };
    const hallazgos = revisarBorrados([
      base,
      { ...base, entityId: "s2", anulado: true },
      { ...base, entityId: "o1", existe: true },
    ]);
    expect(hallazgos.map((h) => [h.tipo, h.codigo, h.esPlata])).toEqual([["BORRADO_SIN_ANULACION", "SAL-00009", true]]);
  });
});

describe("revisarNumeracion", () => {
  it("encuentra huecos y respeta los anulados", () => {
    const hallazgos = revisarNumeracion("ORD", ["ORD-00001", "ORD-00002", "ORD-00005", "COM-00003"], new Set(["ORD-00004"]));
    expect(hallazgos.map((h) => h.codigo)).toEqual(["ORD-00003"]);
  });
  it("sin códigos no hay huecos", () => {
    expect(revisarNumeracion("SAL", [], new Set())).toEqual([]);
  });
});

describe("saldos", () => {
  it("cuentas negativas", () => {
    const hallazgos = revisarCuentasNegativas([
      { nombre: "Caja", saldo: -5_000 },
      { nombre: "Banco", saldo: 0 },
    ]);
    expect(hallazgos.map((h) => [h.tipo, h.codigo])).toEqual([["CUENTA_NEGATIVA", "Caja"]]);
  });
  it("salto: el cambio no lo explican los movimientos del día", () => {
    const cuentas = [
      { id: "a", nombre: "Caja", saldoCierre: 150_000, movimientosDelDia: 50_000 },
      { id: "b", nombre: "Banco", saldoCierre: 80_000, movimientosDelDia: 0 },
      { id: "c", nombre: "Nequi", saldoCierre: 10_000, movimientosDelDia: 0 },
    ];
    const hallazgos = revisarSaltosDeSaldo(cuentas, { a: 100_000, b: 100_000 });
    expect(hallazgos.map((h) => [h.tipo, h.codigo])).toEqual([["SALDO_SIN_EXPLICAR", "Banco"]]);
    expect(revisarSaltosDeSaldo(cuentas, null)).toEqual([]);
  });
});
