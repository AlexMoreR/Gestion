import { describe, expect, it } from "vitest";

import { lotUnitsForLine, splitPurchaseLine, summarizeLotUnits, validateLotTransition } from "./purchase-lot";

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
