import { describe, expect, it } from "vitest";
import { esComboCamillas, necesitaAlertaCombo, planComboOrder, repartirCostoCombo } from "./combo-camillas";

const combo = { productCode: "CMB005" };
const otro = { productCode: "SIL-01" };
const laura = { id: "sup-laura", name: "Laura Gómez" };
const otra = { id: "sup-otra", name: "Fábrica Norte" };

describe("esComboCamillas", () => {
  it("reconoce los dos códigos del combo, sin importar mayúsculas ni espacios", () => {
    expect(esComboCamillas({ productCode: "CMB005" })).toBe(true);
    expect(esComboCamillas({ productCode: " cav-16 " })).toBe(true);
    expect(esComboCamillas({ productCode: "CMB0050" })).toBe(false);
    expect(esComboCamillas({ productCode: null })).toBe(false);
  });
});

describe("planComboOrder", () => {
  it("crea la orden con Laura y el costo por combo", () => {
    expect(planComboOrder({ items: [otro, combo], proveedoras: [otra, laura], costo: 600000, yaTieneOrden: false })).toEqual({
      accion: "crear",
      supplierId: "sup-laura",
      unitCost: 600000,
    });
  });

  it("no hace nada si la venta no trae el combo", () => {
    expect(planComboOrder({ items: [otro], proveedoras: [laura], costo: 600000, yaTieneOrden: false })).toEqual({ accion: "nada" });
  });

  it("no hace nada si la venta ya tiene orden", () => {
    expect(planComboOrder({ items: [combo], proveedoras: [laura], costo: 600000, yaTieneOrden: true })).toEqual({ accion: "nada" });
  });

  it("alerta si la venta no trae productos", () => {
    expect(planComboOrder({ items: [], proveedoras: [laura], costo: 600000, yaTieneOrden: false })).toEqual({
      accion: "alerta",
      motivo: "falta_producto",
    });
  });

  it("alerta si falta el costo o no es positivo", () => {
    for (const costo of [null, 0, -5, Number.NaN]) {
      expect(planComboOrder({ items: [combo], proveedoras: [laura], costo, yaTieneOrden: false })).toEqual({
        accion: "alerta",
        motivo: "falta_costo",
      });
    }
  });

  it("alerta si no hay ninguna proveedora Laura", () => {
    expect(planComboOrder({ items: [combo], proveedoras: [otra, { id: "x", name: "Laureles SAS" }], costo: 600000, yaTieneOrden: false })).toEqual({
      accion: "alerta",
      motivo: "falta_proveedora",
    });
  });

  it("alerta si hay dos proveedoras Laura (no adivina)", () => {
    expect(
      planComboOrder({ items: [combo], proveedoras: [laura, { id: "sup-2", name: "LAURA camillas" }], costo: 600000, yaTieneOrden: false }),
    ).toEqual({ accion: "alerta", motivo: "proveedora_ambigua" });
  });
});

describe("necesitaAlertaCombo", () => {
  it("alerta si trae el combo o no trae productos, sin orden ni cancelada", () => {
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: false, cancelada: false })).toBe(true);
    expect(necesitaAlertaCombo({ items: [], tieneOrden: false, cancelada: false })).toBe(true);
    expect(necesitaAlertaCombo({ items: [otro], tieneOrden: false, cancelada: false })).toBe(false);
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: true, cancelada: false })).toBe(false);
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: false, cancelada: true })).toBe(false);
  });
});

describe("repartirCostoCombo", () => {
  it("pone el costo del combo una sola vez, no por pieza", () => {
    // 2 combos, cada uno con 2 camillas y 1 butaco.
    const unit = repartirCostoCombo([{ quantity: 4 }, { quantity: 2 }], 2, 600000);
    expect(unit).toEqual([300000, 0]);
    expect(unit[0] * 4 + unit[1] * 2).toBe(1200000);
  });

  it("combo sin expandir (una sola línea) lleva el costo completo", () => {
    expect(repartirCostoCombo([{ quantity: 1 }], 1, 600000)).toEqual([600000]);
  });
});
