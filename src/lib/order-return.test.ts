import { describe, expect, it } from "vitest";
import {
  cambiosDeDevolucion,
  efectoDeAnular,
  efectoDeRegistrar,
  mensajeDevolucionAsesora,
  parseOrderReturnEdit,
  estaAbierta,
  estadoDevolucionDeOrden,
  pendientesPorDevolver,
  parseOrderReturnInput,
  perdidaDevolucion,
  puedeVolverAEnviado,
} from "./order-return";
import { getOrderDisplayState } from "./orders";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE = {
  returnDate: "2026-11-05",
  returnReason: "NO_LO_QUISO",
  returnLocation: "BODEGA",
  returnNextStep: "POR_DEFINIR",
  "returnQty:item-1": "1",
};
const HOY = "2026-11-07";

describe("parseOrderReturnInput", () => {
  it("lee un formulario válido con la fecha a medianoche UTC", () => {
    const r = parseOrderReturnInput(form({ ...BASE, returnFreight: "25000", "returnQty:item-2": "0" }), HOY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.returnDate.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(r.value.items).toEqual([{ orderItemId: "item-1", quantity: 1 }]);
    expect(r.value.returnFreight).toBe(25000);
    expect(r.value.reasonText).toBeNull();
  });
  it("OTRO exige texto y lo guarda", () => {
    expect(parseOrderReturnInput(form({ ...BASE, returnReason: "OTRO" }), HOY).ok).toBe(false);
    const r = parseOrderReturnInput(form({ ...BASE, returnReason: "OTRO", returnReasonText: "Se mojó" }), HOY);
    expect(r.ok && r.value.reasonText).toBe("Se mojó");
  });
  it("rechaza claves fuera de lista, fecha futura y sin productos", () => {
    expect(parseOrderReturnInput(form({ ...BASE, returnReason: "X" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, returnLocation: "CASA" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, returnNextStep: "X" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, returnDate: "2026-11-08" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, "returnQty:item-1": "0" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, "returnQty:item-1": "1.5" }), HOY).ok).toBe(false);
    expect(parseOrderReturnInput(form({ ...BASE, returnFreight: "-1" }), HOY).ok).toBe(false);
  });
});

describe("efectoDeRegistrar", () => {
  const salieron = [
    { orderItemId: "a", quantity: 2 },
    { orderItemId: "b", quantity: 1 },
  ];
  it("SHIPPED y vuelve todo → pasa a RETURNED", () => {
    const r = efectoDeRegistrar({ dispatchStatus: "SHIPPED", salieron, devueltasAntes: [], nuevas: salieron });
    expect(r).toEqual({ ok: true, efecto: { tipo: "PASAR_A_DEVUELTO" } });
  });
  it("SHIPPED y vuelve todo contando una devolución abierta anterior → pasa a RETURNED", () => {
    const r = efectoDeRegistrar({
      dispatchStatus: "SHIPPED",
      salieron,
      devueltasAntes: [{ orderItemId: "a", quantity: 2 }],
      nuevas: [{ orderItemId: "b", quantity: 1 }],
    });
    expect(r).toEqual({ ok: true, efecto: { tipo: "PASAR_A_DEVUELTO" } });
  });
  it("SHIPPED y vuelve una parte → solo registro", () => {
    const r = efectoDeRegistrar({ dispatchStatus: "SHIPPED", salieron, devueltasAntes: [], nuevas: [{ orderItemId: "a", quantity: 1 }] });
    expect(r).toEqual({ ok: true, efecto: { tipo: "SOLO_REGISTRO" } });
  });
  it("DELIVERED → marca solo las líneas completas", () => {
    const r = efectoDeRegistrar({
      dispatchStatus: "DELIVERED",
      salieron,
      devueltasAntes: [],
      nuevas: [
        { orderItemId: "a", quantity: 1 },
        { orderItemId: "b", quantity: 1 },
      ],
    });
    expect(r).toEqual({ ok: true, efecto: { tipo: "MARCAR_NO_ENTREGADAS", orderItemIds: ["b"] } });
    const parcial = efectoDeRegistrar({ dispatchStatus: "DELIVERED", salieron, devueltasAntes: [], nuevas: [{ orderItemId: "a", quantity: 1 }] });
    expect(parcial).toEqual({ ok: true, efecto: { tipo: "SOLO_REGISTRO" } });
  });
  it("RETURNED sin registro y sin despacho → solo registro", () => {
    expect(efectoDeRegistrar({ dispatchStatus: "RETURNED", salieron, devueltasAntes: [], nuevas: salieron })).toEqual({
      ok: true,
      efecto: { tipo: "SOLO_REGISTRO" },
    });
    expect(efectoDeRegistrar({ dispatchStatus: null, salieron, devueltasAntes: [], nuevas: salieron })).toEqual({
      ok: true,
      efecto: { tipo: "SOLO_REGISTRO" },
    });
  });
  it("rechaza despacho sin salir, más unidades de las que salieron y productos ajenos", () => {
    expect(efectoDeRegistrar({ dispatchStatus: "PACKING", salieron, devueltasAntes: [], nuevas: salieron }).ok).toBe(false);
    expect(efectoDeRegistrar({ dispatchStatus: "CANCELLED", salieron, devueltasAntes: [], nuevas: salieron }).ok).toBe(false);
    expect(
      efectoDeRegistrar({ dispatchStatus: "SHIPPED", salieron, devueltasAntes: [{ orderItemId: "a", quantity: 2 }], nuevas: [{ orderItemId: "a", quantity: 1 }] }).ok,
    ).toBe(false);
    expect(efectoDeRegistrar({ dispatchStatus: "SHIPPED", salieron, devueltasAntes: [], nuevas: [{ orderItemId: "z", quantity: 1 }] }).ok).toBe(false);
  });
});

describe("estaAbierta y puedeVolverAEnviado", () => {
  const abierta = { closedAt: null, annulledAt: null, dispatchStatusBefore: "SHIPPED" as const };
  it("abierta solo sin cierre ni anulación", () => {
    expect(estaAbierta(abierta)).toBe(true);
    expect(estaAbierta({ closedAt: new Date(), annulledAt: null })).toBe(false);
    expect(estaAbierta({ closedAt: null, annulledAt: new Date() })).toBe(false);
  });
  it("permite volver a SHIPPED si esta devolución lo pasó y no hay otro despacho vivo", () => {
    expect(
      puedeVolverAEnviado({
        devolucion: abierta,
        dispatchStatus: "RETURNED",
        orderItemIds: ["a"],
        otrosDespachos: [{ status: "CANCELLED", orderItemIds: ["a"] }, { status: "SHIPPED", orderItemIds: ["b"] }],
      }),
    ).toBe(true);
  });
  it("rechaza con otro despacho vivo, si ya venía RETURNED o si está cerrada", () => {
    expect(
      puedeVolverAEnviado({ devolucion: abierta, dispatchStatus: "RETURNED", orderItemIds: ["a"], otrosDespachos: [{ status: "PENDING", orderItemIds: ["a"] }] }),
    ).toBe(false);
    expect(
      puedeVolverAEnviado({ devolucion: { ...abierta, dispatchStatusBefore: "RETURNED" }, dispatchStatus: "RETURNED", orderItemIds: ["a"], otrosDespachos: [] }),
    ).toBe(false);
    expect(
      puedeVolverAEnviado({ devolucion: { ...abierta, closedAt: new Date() }, dispatchStatus: "RETURNED", orderItemIds: ["a"], otrosDespachos: [] }),
    ).toBe(false);
  });
});

describe("perdidaDevolucion", () => {
  it("con reparto: suma el flete de lo devuelto, en proporción", () => {
    const r = perdidaDevolucion({
      despacho: {
        shippingCost: 90000,
        lineas: [
          { orderItemId: "a", quantity: 2, shippingCost: "60000.00" },
          { orderItemId: "b", quantity: 1, shippingCost: 30000 },
        ],
      },
      devueltas: [{ orderItemId: "a", quantity: 1 }],
      returnFreight: "20000",
    });
    expect(r).toEqual({ ida: 30000, idaSinRepartir: false, etiquetaIda: null, vuelta: 20000, total: 50000 });
  });
  it("sin reparto: usa el flete del despacho con la etiqueta «sin repartir»", () => {
    const r = perdidaDevolucion({
      despacho: { shippingCost: 45000, lineas: [{ orderItemId: "a", quantity: 1, shippingCost: 0 }] },
      devueltas: [{ orderItemId: "a", quantity: 1 }],
      returnFreight: null,
    });
    expect(r).toEqual({ ida: 45000, idaSinRepartir: true, etiquetaIda: "sin repartir", vuelta: 0, total: 45000 });
  });
});

describe("getOrderDisplayState con devolución", () => {
  const entregado = { deliveryType: "SHIPPING" as const, status: "DELIVERED" as const };
  it("Devuelta en violeta, también en COMPLETED", () => {
    const s = getOrderDisplayState("COMPLETED", entregado, 0, "DEVUELTA");
    expect(s.label).toBe("Devuelta");
    expect(s.className).toContain("violet");
  });
  it("Devolución parcial y falta registrar en ámbar", () => {
    expect(getOrderDisplayState("DISPATCHED", entregado, 0, "PARCIAL")).toMatchObject({ label: "Devolución parcial" });
    const f = getOrderDisplayState("DISPATCHED", { deliveryType: "SHIPPING", status: "RETURNED" }, 0, "FALTA_REGISTRAR");
    expect(f.label).toBe("Devuelta – falta registrar");
    expect(f.className).toContain("amber");
  });
  it("sin el parámetro o cancelada, igual que antes", () => {
    expect(getOrderDisplayState("COMPLETED", entregado, 1).label).toBe("Entregado parcial – 1 sin entregar");
    expect(getOrderDisplayState("COMPLETED", entregado, 0, null).label).toBe("Cerrado – Entregado");
    expect(getOrderDisplayState("CANCELLED", null, 0, "DEVUELTA").label).toBe("Cancelada");
  });
});

describe("estadoDevolucionDeOrden", () => {
  const items = [
    { id: "a", quantity: 2 },
    { id: "b", quantity: 1 },
  ];
  const sinNada = { orderItems: items, devueltasAbiertas: [], despachos: [], despachosConDevolucion: [] };
  it("sin devoluciones ni despachos devueltos → null", () => {
    expect(estadoDevolucionDeOrden(sinNada)).toBeNull();
  });
  it("cubre todas las unidades → DEVUELTA", () => {
    expect(
      estadoDevolucionDeOrden({ ...sinNada, devueltasAbiertas: [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }] }),
    ).toBe("DEVUELTA");
  });
  it("cubre una parte → PARCIAL", () => {
    expect(estadoDevolucionDeOrden({ ...sinNada, devueltasAbiertas: [{ orderItemId: "a", quantity: 1 }] })).toBe("PARCIAL");
  });
  it("despacho RETURNED sin devolución registrada → FALTA_REGISTRAR", () => {
    const despachos = [{ id: "d1", status: "RETURNED", orderItemIds: ["a", "b"] }];
    expect(estadoDevolucionDeOrden({ ...sinNada, despachos })).toBe("FALTA_REGISTRAR");
    expect(estadoDevolucionDeOrden({ ...sinNada, despachos, despachosConDevolucion: ["d1"] })).toBeNull();
  });
  it("los productos volvieron a salir → null", () => {
    const despachos = [
      { id: "d1", status: "RETURNED", orderItemIds: ["a"] },
      { id: "d2", status: "SHIPPED", orderItemIds: ["a", "b"] },
    ];
    expect(estadoDevolucionDeOrden({ ...sinNada, despachos })).toBeNull();
  });
  it("despacho viejo sin productos: cuenta solo si no hay despacho vivo", () => {
    expect(estadoDevolucionDeOrden({ ...sinNada, despachos: [{ id: "d1", status: "RETURNED", orderItemIds: [] }] })).toBe(
      "FALTA_REGISTRAR",
    );
    expect(
      estadoDevolucionDeOrden({
        ...sinNada,
        despachos: [
          { id: "d1", status: "RETURNED", orderItemIds: [] },
          { id: "d2", status: "DELIVERED", orderItemIds: [] },
        ],
      }),
    ).toBeNull();
  });
});

describe("pendientesPorDevolver", () => {
  it("resta lo devuelto antes y quita lo que ya volvió completo", () => {
    expect(
      pendientesPorDevolver(
        [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }],
        [{ orderItemId: "a", quantity: 1 }, { orderItemId: "b", quantity: 1 }],
      ),
    ).toEqual([{ orderItemId: "a", quantity: 1 }]);
  });
});

describe("efectoDeAnular", () => {
  const abierta = { closedAt: null, annulledAt: null, dispatchStatusBefore: "SHIPPED" as const };
  const base = { devolucion: abierta, dispatchStatus: "RETURNED" as const, orderItemIds: ["a"], otrosDespachos: [], reversadas: [] };

  it("el despacho que esta devolución pasó a Devuelto vuelve a En camino", () => {
    expect(efectoDeAnular(base)).toEqual({ ok: true, efecto: { tipo: "VOLVER_A_ENVIADO" } });
  });
  it("con otro despacho vivo de esos productos se rechaza con su código", () => {
    const r = efectoDeAnular({ ...base, otrosDespachos: [{ code: "DES-12", status: "SHIPPED", orderItemIds: ["a"] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("No se puede anular: esos productos ya salieron en otro despacho (DES-12). Cancélalo o ajústalo primero.");
  });
  it("un despacho cancelado o devuelto no bloquea", () => {
    const r = efectoDeAnular({ ...base, otrosDespachos: [{ code: "DES-12", status: "CANCELLED", orderItemIds: ["a"] }] });
    expect(r).toEqual({ ok: true, efecto: { tipo: "VOLVER_A_ENVIADO" } });
  });
  it("si estaba entregado limpia las líneas que marcó esta devolución y deja las de otra reversa", () => {
    const r = efectoDeAnular({
      ...base,
      devolucion: { ...abierta, dispatchStatusBefore: "DELIVERED" },
      dispatchStatus: "DELIVERED",
      orderItemIds: ["a", "b"],
      reversadas: [
        { orderItemId: "a", deEstaDevolucion: true },
        { orderItemId: "b", deEstaDevolucion: false },
      ],
    });
    expect(r).toEqual({ ok: true, efecto: { tipo: "LIMPIAR_ENTREGA", orderItemIds: ["a"], sinTocar: ["b"] } });
  });
  it("si el despacho ya estaba Devuelto de antes, solo se anula", () => {
    const r = efectoDeAnular({ ...base, devolucion: { ...abierta, dispatchStatusBefore: "RETURNED" } });
    expect(r).toEqual({ ok: true, efecto: { tipo: "SOLO_ANULAR" } });
  });
  it("una anulada o cerrada se rechaza", () => {
    expect(efectoDeAnular({ ...base, devolucion: { ...abierta, annulledAt: new Date() } }).ok).toBe(false);
    expect(efectoDeAnular({ ...base, devolucion: { ...abierta, closedAt: new Date() } }).ok).toBe(false);
  });
});

describe("cerrar una devolución", () => {
  it("cerrada ya no cuenta como abierta y no se puede anular", () => {
    const cerrada = { closedAt: new Date("2026-11-08T15:00:00Z"), annulledAt: null, dispatchStatusBefore: "SHIPPED" as const };
    expect(estaAbierta(cerrada)).toBe(false);
    const r = efectoDeAnular({ devolucion: cerrada, dispatchStatus: "RETURNED", orderItemIds: ["a"], otrosDespachos: [], reversadas: [] });
    expect(r.ok).toBe(false);
    expect(
      estadoDevolucionDeOrden({ orderItems: [{ id: "a", quantity: 1 }], devueltasAbiertas: [], despachos: [], despachosConDevolucion: [] }),
    ).toBeNull();
  });
});

describe("mensajeDevolucionAsesora", () => {
  it("trae orden, cliente, productos y motivo, sin costos aunque se le pase el flete", () => {
    const input = {
      asesora: "Ingrid",
      orden: "ORD-95",
      venta: "SAL-40",
      cliente: "Ana Pérez",
      productos: ["Camilla × 1"],
      motivo: "El cliente no lo quiso",
      dondeEsta: "En bodega",
      queSigue: "Reenviar",
      returnFreight: 45000,
    } as Parameters<typeof mensajeDevolucionAsesora>[0];
    const text = mensajeDevolucionAsesora(input);
    for (const part of ["ORD-95", "SAL-40", "Ana Pérez", "Camilla × 1", "El cliente no lo quiso", "En bodega", "Reenviar"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain("$");
    expect(text).not.toContain("45");
  });
});

describe("parseOrderReturnEdit y cambiosDeDevolucion", () => {
  const EDIT = { returnReason: "NO_LO_QUISO", returnLocation: "BODEGA", returnNextStep: "POR_DEFINIR" };
  it("Otro sin texto se rechaza", () => {
    expect(parseOrderReturnEdit(form({ ...EDIT, returnReason: "OTRO" })).ok).toBe(false);
  });
  it("flete negativo o mayor al tope se rechaza", () => {
    expect(parseOrderReturnEdit(form({ ...EDIT, returnFreight: "-1" })).ok).toBe(false);
    expect(parseOrderReturnEdit(form({ ...EDIT, returnFreight: "20000001" })).ok).toBe(false);
  });
  it("el antes y el después solo trae lo que cambió", () => {
    const r = parseOrderReturnEdit(form({ ...EDIT, returnLocation: "EN_TRANSITO", returnFreight: "30000" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const antes = { reason: "NO_LO_QUISO", reasonText: null, comment: null, location: "BODEGA", nextStep: "POR_DEFINIR", returnFreight: "30000.00" };
    expect(cambiosDeDevolucion(antes, r.value)).toEqual({ before: { dondeEsta: "En bodega" }, after: { dondeEsta: "En tránsito" } });
    expect(cambiosDeDevolucion({ ...antes, location: "EN_TRANSITO" }, r.value)).toBeNull();
  });
});
