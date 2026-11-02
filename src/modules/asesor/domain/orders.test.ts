import { describe, expect, it } from "vitest";
import type { OrderTracking } from "./entities";
import { findOrders, listOpenOrders } from "./orders";

const at = (iso: string) => new Date(iso);

function order(overrides: Partial<OrderTracking> & { code?: number; client?: string; status?: string | null; created?: string; saleStatus?: string }): OrderTracking {
  const { code = 78, client = "Adriana Luz Herrera", status = "IN_PRODUCTION", created = "2026-10-20T15:00:00Z", saleStatus = "ACTIVE", ...rest } = overrides;
  const pad = String(code).padStart(5, "0");
  return {
    ledger: {
      saleId: `s${code}`,
      saleCode: `SAL-${pad}`,
      quoteCode: `COT-${pad}`,
      quoteCreatedAt: at("2026-10-18T15:00:00Z"),
      saleCreatedAt: at(created),
      clientName: client,
      sellerName: "Ingrid",
      saleStatus,
      orderStatus: status,
      paymentMethod: "CONTRAENTREGA",
      total: 1000,
      recordedPaid: 400,
      deliveredAt: status === "COMPLETED" ? at("2026-10-28T20:00:00Z") : null,
      payments: [{ amount: 400, paymentDate: null, registeredAt: at(created), accountName: "Banco", method: null, note: null }],
    },
    orderCode: status ? `ORD-${pad}` : null,
    orderCreatedAt: status ? at(created) : null,
    clientPhone: "300 123 4567",
    city: "Bogotá, D.C.",
    department: "Bogotá, D.C.",
    products: [{ nombre: "Silla barbera Zeus", codigo: "ZEUS", color: "Negro", cantidad: 1 }],
    manufacturingOrders: [{ code: "OF-00003", supplierName: "Laura" }],
    statusChanges: [
      { toStatus: "RELEASED", at: at("2026-10-21T15:00:00Z") },
      { toStatus: "IN_PRODUCTION", at: at("2026-10-22T15:00:00Z") },
    ],
    dispatches: [],
    ...rest,
  };
}

describe("buscar_pedido", () => {
  it("encuentra por nombre sin tildes y por ciudad", () => {
    const orders = [order({}), order({ code: 80, client: "Alma Ruiz", city: "Cali", department: "Valle del Cauca" })];
    expect(findOrders(orders, "adriana").pedidos.map((p) => p.venta)).toEqual(["SAL-00078"]);
    expect(findOrders(orders, "Alma").pedidos.map((p) => p.venta)).toEqual(["SAL-00080"]);
    expect(findOrders(orders, "bogota").pedidos.map((p) => p.venta)).toEqual(["SAL-00078"]);
    expect(findOrders(orders, "zeus negro").coincidencias).toBe(0);
    expect(findOrders(orders, "silla zeus").coincidencias).toBe(2);
  });

  it("encuentra por codigo con o sin ceros y por telefono", () => {
    const orders = [order({}), order({ code: 3, manufacturingOrders: [] })];
    for (const text of ["78", "sal-78", "SAL-00078", "ord-78", "COT-00078"]) {
      expect(findOrders(orders, text).pedidos.map((p) => p.venta)).toEqual(["SAL-00078"]);
    }
    expect(findOrders(orders, "OF-3").pedidos.map((p) => p.venta)).toEqual(["SAL-00078"]);
    expect(findOrders(orders, "of-00003").pedidos.map((p) => p.venta)).toEqual(["SAL-00078"]);
    // Un numero solo busca en todos los codigos: 3 = SAL-00003 y OF-00003.
    expect(findOrders(orders, "3").coincidencias).toBe(2);
    expect(findOrders(orders, "3001234567").coincidencias).toBe(2);
  });

  it("da el estado en palabras con su fecha; despachado trae transportador y guia", () => {
    const [enFabricacion] = findOrders([order({})], "adriana").pedidos;
    expect(enFabricacion).toMatchObject({ estado: "en fabricación", fecha_estado: "2026-10-22", contraentrega: true, pagado: 400, saldo_pendiente: 600 });
    expect(enFabricacion.proveedoras).toEqual([{ proveedora: "Laura", of: "OF-00003" }]);

    const despachado = order({
      status: "DISPATCHED",
      statusChanges: [{ toStatus: "DISPATCHED", at: at("2026-10-25T15:00:00Z") }],
      dispatches: [
        { code: "DES-1", carrierName: "Servientrega", trackingNumber: "G-123", shippingAddress: "Cra 1", shippedAt: at("2026-10-25T15:00:00Z"), deliveredAt: null },
      ],
    });
    const [p] = findOrders([despachado], "adriana").pedidos;
    expect(p).toMatchObject({ estado: "despachado", fecha_estado: "2026-10-25" });
    expect(p.despachos[0]).toMatchObject({ transportador: "Servientrega", guia: "G-123", direccion: "Cra 1" });

    const [entregado] = findOrders([order({ status: "COMPLETED", statusChanges: [] })], "adriana").pedidos;
    expect(entregado).toMatchObject({ estado: "entregado", fecha_estado: "2026-10-28" });
    const [porFabricar] = findOrders([order({ status: "DRAFT", statusChanges: [] })], "adriana").pedidos;
    expect(porFabricar).toMatchObject({ estado: "por fabricar", fecha_estado: "2026-10-20" });
    const [listo] = findOrders([order({ status: "READY_FOR_DISPATCH", statusChanges: [{ toStatus: "READY_FOR_DISPATCH", at: at("2026-10-24T15:00:00Z") }] })], "adriana").pedidos;
    expect(listo).toMatchObject({ estado: "listo para despacho", fecha_estado: "2026-10-24" });
  });

  it("sin ciudad sale 'sin dato' y se cuenta", () => {
    const result = findOrders([order({ city: null, department: null }), order({ code: 79 })], "adriana");
    expect(result.sin_ciudad).toBe(1);
    expect(result.pedidos.find((p) => p.venta === "SAL-00078")).toMatchObject({ ciudad: "sin dato", departamento: "sin dato" });
  });

  it("con mas de 10 trae 10, el mas reciente primero", () => {
    const orders = Array.from({ length: 12 }, (_, i) =>
      order({ code: i + 1, created: `2026-10-${String(i + 1).padStart(2, "0")}T15:00:00Z` }),
    );
    const result = findOrders(orders, "adriana");
    expect(result.coincidencias).toBe(12);
    expect(result.pedidos).toHaveLength(10);
    expect(result.pedidos[0].venta).toBe("SAL-00012");
    expect(result.pedidos[9].venta).toBe("SAL-00003");
  });

  it("nunca trae canceladas", () => {
    const orders = [order({ saleStatus: "CANCELLED" }), order({ code: 79, status: "CANCELLED" })];
    expect(findOrders(orders, "adriana").coincidencias).toBe(0);
  });
});

describe("pedidos_abiertos", () => {
  it("no trae entregados ni cancelados; cuenta los sin ciudad", () => {
    const orders = [
      order({ code: 1, status: "COMPLETED" }),
      order({ code: 2, status: "CANCELLED" }),
      order({ code: 3, saleStatus: "CANCELLED" }),
      order({ code: 4, status: null, city: null }),
      order({ code: 5, created: "2026-10-25T15:00:00Z" }),
    ];
    const result = listOpenOrders(orders);
    expect(result.pedidos.map((p) => p.venta)).toEqual(["SAL-00005", "SAL-00004"]);
    expect(result.sin_ciudad).toBe(1);
    expect(result.pedidos[1]).toMatchObject({ estado: "sin orden (falta crear la orden)", orden: null });
  });
});
