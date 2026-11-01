import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en memoria: solo lo que usa el caso de uso (sin conectarse a ninguna base).
const db = vi.hoisted(() => {
  const state = {
    settings: new Map<string, string>(),
    suppliers: [] as Array<{ id: string; name: string }>,
    supplierCosts: new Map<string, number | null>(),
    sale: null as null | { order: { id: string } | null; quote: { items: unknown[] } },
    orderItems: [] as Array<{ id: string; quoteItemId: string | null }>,
    ordersCreated: 0,
    confirmed: [] as Array<{ orderItemId: string; supplierId: string; unitCost: number }>,
    logs: [] as string[],
  };
  const client = {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        state.settings.has(where.key) ? { value: state.settings.get(where.key)! } : null,
    },
    supplier: {
      findUnique: async ({ where }: { where: { id: string } }) => state.suppliers.find((s) => s.id === where.id) ?? null,
      findMany: async () => state.suppliers.filter((s) => s.name.toLowerCase().includes("laura")),
    },
    sale: { findUnique: async () => state.sale },
    productSupplier: {
      findMany: async ({ where }: { where: { supplierId: string; product: { code: { in: string[] } } } }) =>
        where.product.code.in
          .filter((code) => state.supplierCosts.has(`${where.supplierId}:${code}`))
          .map((code) => ({ supplierCost: state.supplierCosts.get(`${where.supplierId}:${code}`) })),
    },
    orderItem: { findMany: async () => state.orderItems },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { state, client };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: db.client }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: async ({ summary }: { summary: string }) => {
    db.state.logs.push(summary);
  },
}));
vi.mock("@/lib/sale-order", () => ({
  createSaleOrder: async () => {
    if (db.state.sale?.order) return { ok: false, motivo: "ya_tiene_orden" };
    db.state.ordersCreated += 1;
    db.state.sale!.order = { id: "ord-1" };
    return { ok: true, orderId: "ord-1", orderCode: "ORD-0001" };
  },
}));
vi.mock("@/lib/order-item-confirm", () => ({
  confirmOrderItemSupplier: async (_tx: unknown, input: { orderItemId: string; supplierId: string; unitCost: number }) => {
    db.state.confirmed.push({ orderItemId: input.orderItemId, supplierId: input.supplierId, unitCost: input.unitCost });
    return { ok: true, orderId: "ord-1" };
  },
}));

import { stringifyQuoteItemMeta } from "../../../lib/quote-item-meta";
import { autoCreateComboOrder } from "./auto-create-combo-order";

// Asi guarda la cotizacion un combo: partido en piezas con el mismo comboKey.
const nota = (comboKey: string, comboQuantity = 1) =>
  stringifyQuoteItemMeta({ color: "Negro", comboKey, comboName: "Combo Camillas", comboCode: "CMB005", comboQuantity });
const piezas = (comboKey: string, comboQuantity = 1) => [
  { id: `${comboKey}-camilla`, quantity: 2 * comboQuantity, notes: nota(comboKey, comboQuantity), product: { code: "CAM010" } },
  { id: `${comboKey}-butaco`, quantity: comboQuantity, notes: nota(comboKey, comboQuantity), product: { code: "BMV016" } },
];
const enOrden = (items: Array<{ id: string }>) => items.map((item) => ({ id: `oi-${item.id}`, quoteItemId: item.id }));

describe("autoCreateComboOrder", () => {
  beforeEach(() => {
    db.state.settings.clear();
    db.state.suppliers = [
      { id: "sup-laura", name: "Laura" },
      { id: "sup-otra", name: "Tapiceria Gomez" },
    ];
    db.state.supplierCosts = new Map([["sup-laura:CMB005", 600000]]);
    db.state.sale = { order: null, quote: { items: piezas("k1") } };
    db.state.orderItems = enOrden(piezas("k1"));
    db.state.ordersCreated = 0;
    db.state.confirmed = [];
    db.state.logs = [];
  });

  it("crea la orden y confirma las piezas con Laura: 600.000 una sola vez por combo", async () => {
    const result = await autoCreateComboOrder("sale-1", "admin-1");
    expect(result).toEqual({ creada: true, orderId: "ord-1", orderCode: "ORD-0001" });
    expect(db.state.confirmed).toEqual([
      { orderItemId: "oi-k1-camilla", supplierId: "sup-laura", unitCost: 300000 },
      { orderItemId: "oi-k1-butaco", supplierId: "sup-laura", unitCost: 0 },
    ]);
    expect(db.state.logs).toEqual(["Orden creada sola (Combo Camillas): ORD-0001"]);
  });

  it("una segunda llamada no crea otra orden", async () => {
    await autoCreateComboOrder("sale-1", "admin-1");
    const second = await autoCreateComboOrder("sale-1", "admin-1");
    expect(second).toEqual({ creada: false, plan: { accion: "nada" } });
    expect(db.state.ordersCreated).toBe(1);
    expect(db.state.confirmed).toHaveLength(2);
  });

  it("una venta sin el combo no crea nada", async () => {
    db.state.sale = { order: null, quote: { items: [{ id: "q1", quantity: 1, notes: null, product: { code: "CAM001" } }] } };
    expect(await autoCreateComboOrder("sale-1", "admin-1")).toEqual({ creada: false, plan: { accion: "nada" } });
    expect(db.state.ordersCreated).toBe(0);
  });

  it("sin costo de Laura para el combo no crea nada y deja la alerta", async () => {
    db.state.supplierCosts.clear();
    expect(await autoCreateComboOrder("sale-1", "admin-1")).toEqual({ creada: false, plan: { accion: "alerta", motivo: "falta_costo" } });
    expect(db.state.ordersCreated).toBe(0);
  });

  it("usa la proveedora guardada en comboCamillasConfig antes que buscar por nombre", async () => {
    db.state.suppliers.push({ id: "sup-laura-2", name: "Laura Fabrica" });
    db.state.settings.set("comboCamillasConfig", JSON.stringify({ supplierId: "sup-laura-2" }));
    db.state.supplierCosts.set("sup-laura-2:CMB005", 600000);
    const result = await autoCreateComboOrder("sale-1", "admin-1");
    expect(result.creada).toBe(true);
    expect(db.state.confirmed.every((c) => c.supplierId === "sup-laura-2")).toBe(true);
  });

  it("dos combos en la venta: cada uno lleva su costo (cargo total 1.200.000)", async () => {
    const items = [...piezas("k1"), ...piezas("k2", 1)];
    db.state.sale = { order: null, quote: { items } };
    db.state.orderItems = enOrden(items);
    await autoCreateComboOrder("sale-1", "admin-1");
    const cargo = db.state.confirmed.reduce((sum, c) => sum + c.unitCost * items.find((i) => `oi-${i.id}` === c.orderItemId)!.quantity, 0);
    expect(cargo).toBe(1200000);
  });

  it("un combo guardado como una sola linea (sin piezas) va entero", async () => {
    const items = [{ id: "q-combo", quantity: 2, notes: null, product: { code: "cav-16" } }];
    db.state.supplierCosts = new Map([["sup-laura:CAV-16", 600000]]);
    db.state.sale = { order: null, quote: { items } };
    db.state.orderItems = enOrden(items);
    await autoCreateComboOrder("sale-1", "admin-1");
    expect(db.state.confirmed).toEqual([{ orderItemId: "oi-q-combo", supplierId: "sup-laura", unitCost: 600000 }]);
  });
});
