import { describe, expect, it } from "vitest";
import { lineasAgregadas } from "./quote-lines";
import {
  AVISO_PRODUCTO_CANCELADO,
  bloqueoCancelarProducto,
  faltaEnCambio,
  montoACancelar,
  saldoAFavor,
  textoAvisoOF,
  type PiezaACancelar,
} from "./sale-item-cancel";

const pieza = (extra: Partial<PiezaACancelar> = {}): PiezaACancelar => ({
  fulfillmentMode: "MANUFACTURE",
  despachos: 0,
  devolucionesOReversas: 0,
  fotos: 0,
  supplierPaymentStatus: null,
  ofRecibida: false,
  ...extra,
});
const base = { esVenta: true, ordenEstado: "IN_PRODUCTION", ventaEstado: "ACTIVE", devolucionAbierta: false, piezasOrden: 3 };

describe("bloqueoCancelarProducto", () => {
  it("deja cancelar lo confirmado sin recoger (se deshace solo)", () => {
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ supplierPaymentStatus: "PENDING" })] })).toBeNull();
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ fulfillmentMode: "STOCK" })] })).toBeNull();
  });
  it("no deja si ya avanzó: recogido, OF recibida o despachado", () => {
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ fotos: 1, supplierPaymentStatus: "PENDING" })] })).toMatch(/recogido/);
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ supplierPaymentStatus: "PAID" })] })).toMatch(/pagó/);
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ ofRecibida: true })] })).toMatch(/OF recibida/);
    expect(bloqueoCancelarProducto({ ...base, piezas: [pieza({ despachos: 1 })] })).toMatch(/despacho/);
  });
  it("si es todo lo que queda, manda a Cancelar orden; venta cerrada o cancelada no se toca", () => {
    expect(bloqueoCancelarProducto({ ...base, piezasOrden: 1, piezas: [pieza()] })).toMatch(/Cancelar/);
    expect(bloqueoCancelarProducto({ ...base, ordenEstado: "COMPLETED", piezas: [pieza()] })).toMatch(/cerrada/);
    expect(bloqueoCancelarProducto({ ...base, ventaEstado: "CANCELLED", piezas: [pieza()] })).toMatch(/cancelada/);
  });
  it("en un cambio, ser el único no bloquea (lo demás sí)", () => {
    expect(bloqueoCancelarProducto({ ...base, piezasOrden: 1, piezas: [pieza()], enCambio: true })).toBeNull();
    expect(bloqueoCancelarProducto({ ...base, piezasOrden: 1, piezas: [pieza({ despachos: 1 })], enCambio: true })).toMatch(/despacho/);
  });
});

describe("faltaEnCambio", () => {
  const ok = { motivo: "Pidió otro combo", lineasNuevas: 1, tieneOF: false, aceptaOF: false, ordenCancelada: false, reactivar: false };
  it("con todo listo, nada falta", () => {
    expect(faltaEnCambio(ok)).toBeNull();
    expect(faltaEnCambio({ ...ok, tieneOF: true, aceptaOF: true, ordenCancelada: true, reactivar: true })).toBeNull();
  });
  it("pide producto nuevo, motivo de 3 letras y las dos casillas", () => {
    expect(faltaEnCambio({ ...ok, lineasNuevas: 0 })).toMatch(/producto nuevo/);
    expect(faltaEnCambio({ ...ok, motivo: " no " })).toMatch(/mínimo 3/);
    expect(faltaEnCambio({ ...ok, tieneOF: true })).toMatch(/OF/);
    expect(faltaEnCambio({ ...ok, ordenCancelada: true })).toMatch(/Reactivar/);
  });
});

describe("plata", () => {
  it("el monto sale de la cotización; sin ella, de la orden", () => {
    expect(montoACancelar([{ lineTotal: "300000.00" }, { lineTotal: 50000 }], [{ lineTotal: 1 }])).toBe(350000);
    expect(montoACancelar([], [{ lineTotal: "120000.5" }])).toBe(120000.5);
  });
  it("saldo a favor solo si pagó de más", () => {
    expect(saldoAFavor(500000, 350000)).toBe(150000);
    expect(saldoAFavor(100000, 350000)).toBe(0);
  });
  it("el aviso de la OF dice cancelado o el cambio de color", () => {
    expect(textoAvisoOF({ producto: "Escalera", colorViejo: "Negro", colorNuevo: AVISO_PRODUCTO_CANCELADO })).toMatch(/cancelado/);
    expect(textoAvisoOF({ producto: "Escalera", colorViejo: "Negro", colorNuevo: "Rosado" })).toBe("Escalera Negro → Rosado");
  });
});

describe("lineasAgregadas", () => {
  const l = (productId: string, quantity = 1) => ({ productId, quantity, unitPrice: 100, fulfillmentMode: "STOCK", notes: null });
  it("devuelve solo las nuevas si las viejas siguen iguales", () => {
    expect(lineasAgregadas([l("a"), l("b")], [l("b"), l("a"), l("c")])).toEqual([l("c")]);
    expect(lineasAgregadas([l("a")], [l("a")])).toEqual([]);
  });
  it("null si una vieja cambió o se quitó", () => {
    expect(lineasAgregadas([l("a"), l("b")], [l("a"), l("c")])).toBeNull();
    expect(lineasAgregadas([l("a")], [l("a", 2)])).toBeNull();
  });
});
