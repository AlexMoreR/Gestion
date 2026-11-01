import { describe, expect, it } from "vitest";
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { calculateSaleProfitSummary } from "../../balances/domain/calculations";
import { esComboCamillas, necesitaAlertaCombo, planComboOrder, repartirCostoCombo } from "./combo-camillas";

const laura = { id: "sup-laura", name: "Laura" };
const otra = { id: "sup-otra", name: "Tapiceria Gomez" };
const combo = { codigo: "CMB005", cantidad: 1 };

describe("esComboCamillas", () => {
  it("reconoce los dos codigos, sin importar mayusculas ni espacios", () => {
    expect(esComboCamillas({ codigo: "CMB005" })).toBe(true);
    expect(esComboCamillas({ codigo: " cav-16 " })).toBe(true);
    expect(esComboCamillas({ codigo: "CAM001" })).toBe(false);
    expect(esComboCamillas({ codigo: null })).toBe(false);
  });
});

describe("planComboOrder", () => {
  it("crea la orden con Laura y el costo por combo", () => {
    expect(
      planComboOrder({ items: [{ codigo: "CAV-16", cantidad: 2 }], proveedoras: [otra, laura], costo: 600000, yaTieneOrden: false }),
    ).toEqual({ accion: "crear", supplierId: "sup-laura", unitCost: 600000, combos: 2 });
  });

  it("reconoce a Laura con tilde o mayusculas como palabra completa", () => {
    const plan = planComboOrder({ items: [combo], proveedoras: [{ id: "x", name: "Fábrica LÁURA" }, { id: "y", name: "Laurita" }], costo: 600000, yaTieneOrden: false });
    expect(plan).toEqual({ accion: "crear", supplierId: "x", unitCost: 600000, combos: 1 });
  });

  it("no hace nada si la venta no trae el combo", () => {
    expect(planComboOrder({ items: [{ codigo: "CAM001", cantidad: 1 }], proveedoras: [laura], costo: 600000, yaTieneOrden: false })).toEqual({ accion: "nada" });
  });

  it("no hace nada si ya tiene orden", () => {
    expect(planComboOrder({ items: [combo], proveedoras: [laura], costo: 600000, yaTieneOrden: true })).toEqual({ accion: "nada" });
    expect(planComboOrder({ items: [], proveedoras: [], costo: null, yaTieneOrden: true })).toEqual({ accion: "nada" });
  });

  it("alerta falta_producto si la venta no tiene items", () => {
    expect(planComboOrder({ items: [], proveedoras: [laura], costo: 600000, yaTieneOrden: false })).toEqual({ accion: "alerta", motivo: "falta_producto" });
  });

  it("alerta falta_costo con costo nulo, cero o negativo", () => {
    for (const costo of [null, undefined, 0, -5, Number.NaN]) {
      expect(planComboOrder({ items: [combo], proveedoras: [laura], costo, yaTieneOrden: false })).toEqual({ accion: "alerta", motivo: "falta_costo" });
    }
  });

  it("alerta si no hay Laura o hay dos", () => {
    expect(planComboOrder({ items: [combo], proveedoras: [otra], costo: 600000, yaTieneOrden: false })).toEqual({ accion: "alerta", motivo: "falta_proveedora" });
    expect(
      planComboOrder({ items: [combo], proveedoras: [laura, { id: "sup-2", name: "Laura Gomez" }], costo: 600000, yaTieneOrden: false }),
    ).toEqual({ accion: "alerta", motivo: "proveedora_ambigua" });
  });
});

describe("necesitaAlertaCombo", () => {
  it("avisa si trae el combo o no trae productos, sin orden ni cancelada", () => {
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: false, cancelada: false })).toBe(true);
    expect(necesitaAlertaCombo({ items: [], tieneOrden: false, cancelada: false })).toBe(true);
    expect(necesitaAlertaCombo({ items: [{ codigo: "CAM001", cantidad: 1 }], tieneOrden: false, cancelada: false })).toBe(false);
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: true, cancelada: false })).toBe(false);
    expect(necesitaAlertaCombo({ items: [combo], tieneOrden: false, cancelada: true })).toBe(false);
  });
});

describe("repartirCostoCombo", () => {
  it("pone el costo una sola vez por combo, nunca por pieza", () => {
    const piezas = [{ cantidadPorCombo: 0 }, { cantidadPorCombo: 2 }, { cantidadPorCombo: 1 }];
    const costos = repartirCostoCombo(600000, piezas);
    expect(costos).toEqual([0, 300000, 0]);
    expect(costos.reduce((sum, c, i) => sum + c * piezas[i].cantidadPorCombo, 0)).toBe(600000);
  });

  it("sin componentes (el combo es una sola linea) va entero", () => {
    expect(repartirCostoCombo(600000, [{ cantidadPorCombo: 1 }])).toEqual([600000]);
  });
});

describe("costo del combo confirmado con Laura", () => {
  it("con purchaseCost 600.000 la ganancia de Balances deja de ser 100 %", () => {
    // Sin costo cargado (combo sin costo base), Balances mostraba toda la venta como ganancia.
    const sinCosto = { quantity: 1, purchaseCost: null, fulfillmentMode: "MANUFACTURE", baseCost: 0, additionalCost: 0 };
    const venta = { saleId: "s", saleCode: "SAL-1", saleAmount: 989000, createdAt: new Date(), clientName: null, shippingCosts: [] };
    expect(calculateSaleProfitSummary({ ...venta, orderItems: [sinCosto] }).marginPercentage).toBe(100);

    const conLaura = { ...sinCosto, purchaseCost: 600000 };
    expect(computeItemUnitCost(conLaura)).toBe(600000);
    const resumen = calculateSaleProfitSummary({ ...venta, orderItems: [conLaura, { ...sinCosto, purchaseCost: 0 }] });
    expect(resumen.supplierCosts).toBe(600000);
    expect(resumen.netProfit).toBe(389000);
    expect(resumen.marginPercentage).toBeLessThan(100);
  });
});
