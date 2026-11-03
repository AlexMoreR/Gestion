import { describe, expect, it } from "vitest";

import {
  lotArrivalEntries,
  lotLineTotal,
  lotUnitLabel,
  lotUnitsForLine,
  splitPurchaseLine,
  summarizeLotUnits,
  validateLotTransition,
} from "./purchase-lot";

describe("splitPurchaseLine", () => {
  it("6 unidades con 3 pendientes: entran 3", () => {
    expect(splitPurchaseLine(6, 3)).toEqual({ entranAlInventario: 3, pendientes: 3 });
  });
  it("rechaza pendientes fuera de rango o no enteras", () => {
    expect(() => splitPurchaseLine(6, 7)).toThrow();
    expect(() => splitPurchaseLine(6, -1)).toThrow();
    expect(() => splitPurchaseLine(6, 1.5)).toThrow();
  });
});

describe("validateLotTransition", () => {
  it("no pasa de PENDIENTE a VENDIDA", () => {
    expect(validateLotTransition({ estado: "PENDIENTE" }, "vendida", { saleOrderId: "o1" })).not.toBeNull();
  });
  it("no pasa a fabricar sin color", () => {
    expect(validateLotTransition({ estado: "PENDIENTE" }, "fabricar", { color: "  " })).toBe(
      "Ponle el color antes de pasarla a fabricar",
    );
    expect(validateLotTransition({ estado: "PENDIENTE" }, "fabricar", { color: "Negro" })).toBeNull();
  });
  it("llegó, ubicación, color y vendida", () => {
    expect(validateLotTransition({ estado: "FABRICANDO" }, "llego", { ubicacion: "CALI" })).toBeNull();
    expect(validateLotTransition({ estado: "FABRICANDO" }, "llego", { ubicacion: "BOGOTA" })).not.toBeNull();
    expect(validateLotTransition({ estado: "EN_INVENTARIO", ubicacion: "CALI" }, "ubicacion", { ubicacion: "CALI" })).not.toBeNull();
    expect(
      validateLotTransition({ estado: "EN_INVENTARIO", ubicacion: "CALI" }, "ubicacion", { ubicacion: "TALLER_PROVEEDORA" }),
    ).toBeNull();
    expect(validateLotTransition({ estado: "PENDIENTE" }, "color", { color: "Rojo" })).not.toBeNull();
    expect(validateLotTransition({ estado: "EN_INVENTARIO" }, "color", { color: "Rojo" })).toBeNull();
    expect(validateLotTransition({ estado: "EN_INVENTARIO" }, "vendida", {})).not.toBeNull();
    expect(validateLotTransition({ estado: "EN_INVENTARIO" }, "vendida", { saleOrderId: "o1" })).toBeNull();
  });
});

describe("summarizeLotUnits", () => {
  it("Cali, Cali→Taller y pendientes", () => {
    const unidades = [
      { estado: "EN_INVENTARIO", ubicacion: "CALI" },
      { estado: "EN_INVENTARIO", ubicacion: "CALI" },
      // La que pasó de Cali al taller.
      { estado: "EN_INVENTARIO", ubicacion: "TALLER_PROVEEDORA" },
      { estado: "PENDIENTE" },
      { estado: "PENDIENTE" },
      { estado: "PENDIENTE" },
    ];
    expect(summarizeLotUnits(unidades)).toEqual({ cali: 2, taller: 1, fabricando: 0, pendientes: 3, vendidas: 0 });
  });
});

describe("lotUnitsForLine", () => {
  it("6 con 3 pendientes: 3 en Cali y 3 pendientes; sin pendientes no crea filas", () => {
    expect(summarizeLotUnits(lotUnitsForLine(6, 3))).toEqual({ cali: 3, taller: 0, fabricando: 0, pendientes: 3, vendidas: 0 });
    expect(lotUnitsForLine(6, 0)).toEqual([]);
    expect(() => lotUnitsForLine(2, 3)).toThrow();
  });
});

describe("lotUnitLabel", () => {
  it("dice el estado, la ubicación y el color", () => {
    expect(lotUnitLabel({ estado: "PENDIENTE" })).toBe("Pendiente");
    expect(lotUnitLabel({ estado: "FABRICANDO", color: "Negro" })).toBe("Fabricando · Negro");
    expect(lotUnitLabel({ estado: "EN_INVENTARIO", ubicacion: "CALI" })).toBe("En inventario · Cali");
    expect(lotUnitLabel({ estado: "EN_INVENTARIO", ubicacion: "TALLER_PROVEEDORA", color: "Blanco" })).toBe(
      "En inventario · Taller proveedora · Blanco",
    );
    expect(lotUnitLabel({ estado: "VENDIDA" })).toBe("Vendida");
  });
});

describe("lotArrivalEntries", () => {
  it("producto normal suma 1; combo suma sus piezas", () => {
    expect(lotArrivalEntries("p1", null)).toEqual([{ productId: "p1", change: 1 }]);
    expect(
      lotArrivalEntries("combo", [
        { childId: "silla", quantity: 1 },
        { childId: "espejo", quantity: 2 },
      ]),
    ).toEqual([
      { productId: "silla", change: 1 },
      { productId: "espejo", change: 2 },
    ]);
  });
});

describe("lotLineTotal", () => {
  const items = [
    { productId: "silla", lineTotal: 2_400_000, notes: "Combo Combo Spa" },
    { productId: "espejo", lineTotal: 1_080_000, notes: "Combo Combo Spa" },
    { productId: "silla", lineTotal: 500_000, notes: null },
  ];
  it("combo: suma sus piezas; producto normal: solo su línea", () => {
    expect(lotLineTotal(items, { id: "combo", name: "Combo Spa", isBundle: true })).toBe(3_480_000);
    expect(lotLineTotal(items, { id: "silla", name: "Silla", isBundle: false })).toBe(500_000);
  });
});
