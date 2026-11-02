import { describe, expect, it } from "vitest";
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { stringifyQuoteItemMeta } from "../../../lib/quote-item-meta";
import { calculateSaleProfitSummary } from "../../balances/domain/calculations";
import {
  codigosComboDeVenta,
  costosItemsCombo,
  esComboCamillas,
  itemsParaPlan,
  necesitaAlertaCombo,
  planComboOrder,
  repartirCostoCombo,
  type ItemOrden,
  type LineaVenta,
} from "./combo-camillas";

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

  it("en /admin/ventas detecta el combo armado en piezas de la cotizacion (solo cantidad, notas y codigo)", () => {
    const notes = stringifyQuoteItemMeta({ comboKey: "k1", comboName: "Combo Camillas", comboCode: "CMB005", comboQuantity: 1 });
    const filas = [
      { quantity: 1, notes, product: { code: "CAM009" } },
      { quantity: 1, notes, product: { code: "BMV016" } },
    ];
    expect(necesitaAlertaCombo({ items: itemsParaPlan(filas), tieneOrden: false, cancelada: false })).toBe(true);
    expect(necesitaAlertaCombo({ items: itemsParaPlan([{ quantity: 1, notes: null, product: { code: "CAM009" } }]), tieneOrden: false, cancelada: false })).toBe(false);
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

// Combo armado en piezas por el asistente de cotizaciones (forma A).
const piezaA = (id: string, productId: string, quantity: number, comboKey = "k1"): LineaVenta => ({
  id,
  productId,
  quantity,
  notes: stringifyQuoteItemMeta({ comboKey, comboName: "Combo Camillas", comboCode: "CMB005", comboQuantity: 1, color: "Negro" }),
  product: { code: "CAM001", name: "Camilla", piezas: [] },
});
const ordenDe = (lineas: LineaVenta[], mode = "MANUFACTURE"): ItemOrden[] =>
  lineas.map((l) => ({ id: `oi-${l.id}`, quoteItemId: l.id, productId: l.productId, quantity: l.quantity, notes: l.notes, fulfillmentMode: mode }));

describe("combo en piezas (cotizacion del asistente o del CRM)", () => {
  const lineas = [piezaA("q1", "p-camilla", 2), piezaA("q2", "p-butaco", 1), { ...piezaA("q3", "p-otro", 1), notes: null, product: { code: "CAM009", name: "Otra", piezas: [] } }];

  it("cuenta el combo una vez y lo reconoce por su codigo", () => {
    expect(itemsParaPlan(lineas)).toEqual([{ codigo: "CMB005", cantidad: 1 }, { codigo: "CAM009", cantidad: 1 }]);
    expect(codigosComboDeVenta(lineas)).toEqual(["CMB005"]);
  });

  it("pone los 600.000 una sola vez y confirma las demas piezas en 0; no toca lo que no es combo", () => {
    const costos = costosItemsCombo(600000, lineas, ordenDe(lineas));
    expect(costos).toEqual([
      { orderItemId: "oi-q1", unitCost: 300000 },
      { orderItemId: "oi-q2", unitCost: 0 },
    ]);
  });

  it("no confirma piezas por stock", () => {
    expect(costosItemsCombo(600000, lineas, ordenDe(lineas, "STOCK"))).toEqual([]);
  });

  it("con el costo confirmado, Balances usa purchaseCost y la ganancia deja de ser 100 %", () => {
    const orden = ordenDe(lineas);
    const costos = new Map(costosItemsCombo(600000, lineas, orden).map((c) => [c.orderItemId, c.unitCost]));
    const items = orden.map((item) => ({
      quantity: item.quantity,
      purchaseCost: costos.get(item.id) ?? null,
      fulfillmentMode: "MANUFACTURE",
      baseCost: 0, // el combo sin costo en catalogo era lo que dejaba la venta al 100 %
      additionalCost: 0,
    }));
    expect(computeItemUnitCost({ purchaseCost: 300000, fulfillmentMode: "MANUFACTURE", baseCost: 0, additionalCost: 0 })).toBe(300000);

    const antes = calculateSaleProfitSummary({
      saleId: "s", saleCode: "SAL-1", saleAmount: 989000, createdAt: new Date(), clientName: null,
      orderItems: items.map((i) => ({ ...i, purchaseCost: null })), shippingCosts: [],
    });
    const despues = calculateSaleProfitSummary({
      saleId: "s", saleCode: "SAL-1", saleAmount: 989000, createdAt: new Date(), clientName: null, orderItems: items, shippingCosts: [],
    });
    expect(antes.marginPercentage).toBe(100);
    expect(despues.supplierCosts).toBe(600000);
    expect(despues.netProfit).toBe(389000);
    expect(despues.marginPercentage).toBeLessThan(100);
  });

  it("una segunda llamada no crea otra orden", () => {
    const plan = planComboOrder({ items: itemsParaPlan(lineas), proveedoras: [laura], costo: 600000, yaTieneOrden: true });
    expect(plan).toEqual({ accion: "nada" });
  });
});

describe("combo como producto (venta directa)", () => {
  it("sin componentes: una linea con el costo entero", () => {
    const lineas: LineaVenta[] = [{ id: "q1", productId: "p-combo", quantity: 2, notes: null, product: { code: "CMB005", name: "Combo", piezas: [] } }];
    expect(costosItemsCombo(600000, lineas, ordenDe(lineas))).toEqual([{ orderItemId: "oi-q1", unitCost: 600000 }]);
  });

  it("con componentes: la orden lo parte y el costo va en la primera pieza", () => {
    const lineas: LineaVenta[] = [
      { id: "q1", productId: "p-combo", quantity: 1, notes: null, product: { code: "CAV-16", name: "Combo Camillas", piezas: [{ productId: "p-camilla", cantidadPorCombo: 2 }, { productId: "p-butaco", cantidadPorCombo: 1 }] } },
    ];
    const notes = stringifyQuoteItemMeta({ description: "Combo: Combo Camillas" });
    const orden: ItemOrden[] = [
      { id: "a", quoteItemId: null, productId: "p-camilla", quantity: 2, notes, fulfillmentMode: "MANUFACTURE" },
      { id: "b", quoteItemId: null, productId: "p-butaco", quantity: 1, notes, fulfillmentMode: "MANUFACTURE" },
    ];
    expect(costosItemsCombo(600000, lineas, orden)).toEqual([
      { orderItemId: "a", unitCost: 300000 },
      { orderItemId: "b", unitCost: 0 },
    ]);
  });
});
