import { describe, expect, it } from "vitest";
import {
  bloqueoCambioModo,
  bloqueoPorPagosEnLaOrden,
  costoTotal,
  direccionDeCambio,
  faltaStock,
  gananciaVenta,
  parseCostoUnitario,
  parseMotivoCambio,
} from "./order-item-mode-change";

describe("direccionDeCambio", () => {
  it("solo lo confirmado; fabricación va a stock y stock a fabricación", () => {
    expect(direccionDeCambio({ fulfillmentMode: "MANUFACTURE", confirmedAt: new Date() })).toBe("A_STOCK");
    expect(direccionDeCambio({ fulfillmentMode: "STOCK", confirmedAt: "2026-11-04" })).toBe("A_FABRICACION");
    expect(direccionDeCambio({ fulfillmentMode: "MANUFACTURE", confirmedAt: null })).toBeNull();
  });
});

describe("bloqueos", () => {
  const base = { esVenta: true, ordenEstado: "COMPLETED", ventaEstado: "INVOICED", piezas: 4 };
  it("deja cambiar aunque esté entregada; no en compras ni canceladas", () => {
    expect(bloqueoCambioModo(base)).toBeNull();
    expect(bloqueoCambioModo({ ...base, esVenta: false })).toMatch(/venta/);
    expect(bloqueoCambioModo({ ...base, ordenEstado: "CANCELLED" })).toMatch(/cancelada/);
    expect(bloqueoCambioModo({ ...base, piezas: 0 })).toMatch(/selector/);
  });
  it("no deja a la proveedora con más pagado que cargado", () => {
    expect(bloqueoPorPagosEnLaOrden({ proveedora: "Laura", cargadoEnOrden: 580000, pagadoEnOrden: 0, seAnula: 580000 })).toBeNull();
    expect(bloqueoPorPagosEnLaOrden({ proveedora: "Laura", cargadoEnOrden: 1150000, pagadoEnOrden: 500000, seAnula: 600000 })).toBeNull();
    expect(bloqueoPorPagosEnLaOrden({ proveedora: "Laura", cargadoEnOrden: 600000, pagadoEnOrden: 300000, seAnula: 600000 })).toMatch(/ya se le pagó \$300\.000/);
  });
  it("revisa el stock sumando piezas repetidas", () => {
    expect(faltaStock([{ productId: "d", nombre: "Divan", cantidad: 1, stock: 1 }])).toBeNull();
    expect(
      faltaStock([
        { productId: "d", nombre: "Divan", cantidad: 1, stock: 1 },
        { productId: "d", nombre: "Divan", cantidad: 1, stock: 1 },
      ]),
    ).toMatch(/hay 1 y se necesitan 2/);
  });
});

describe("números", () => {
  it("lee el costo escrito y el motivo", () => {
    expect(parseCostoUnitario("580.000")).toBe(580000);
    expect(parseCostoUnitario("$ 45000")).toBe(45000);
    expect(parseCostoUnitario("-1")).toBeNull();
    expect(parseCostoUnitario("")).toBeNull();
    expect(parseMotivoCambio("  ")).toMatchObject({ ok: false });
    expect(parseMotivoCambio("salió de la ORD-99")).toEqual({ ok: true, value: "salió de la ORD-99" });
  });
  it("ORD-97: el combo de la compra cuesta lo mismo que la OF, la ganancia no cambia", () => {
    const antes = costoTotal([{ cantidad: 1, costoUnitario: 580000 }]);
    const despues = costoTotal([100000, 45000, 235000, 200000].map((c) => ({ cantidad: 1, costoUnitario: c })));
    expect(despues).toBe(antes);
    expect(gananciaVenta(1169000, despues, 205400)).toBe(gananciaVenta(1169000, antes, 205400));
  });
});
