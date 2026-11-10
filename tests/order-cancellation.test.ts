import { describe, expect, it } from "vitest";
import {
  CANCEL_BLOCK_DISPATCH,
  CANCEL_REASONS,
  cancelBlock,
  cancelNote,
  hasPayments,
  closedOrderMessage,
  estadoAlReactivar,
  openManufacturingOrders,
  ORDER_CANCELLED_BLOCK,
  parseCancelInput,
  parseReactivateInput,
  stockToRetake,
  ultimaCancelacion,
  motivoDeCancelacion,
  filtrarCanceladas,
  resumenCanceladas,
  parseFiltrosCanceladas,
  type CanceladaFila,
} from "../src/lib/order-cancellation";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseCancelInput", () => {
  it("acepta cada uno de los 5 motivos", () => {
    expect(CANCEL_REASONS).toHaveLength(5);
    for (const { key } of CANCEL_REASONS) {
      const result = parseCancelInput(form({ cancelReason: key, cancelReasonText: key === "OTRO" ? "Se mudó" : "" }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.reason).toBe(key);
    }
  });

  it("con Otro sin texto da error", () => {
    expect(parseCancelInput(form({ cancelReason: "OTRO" })).ok).toBe(false);
    expect(parseCancelInput(form({ cancelReason: "OTRO", cancelReasonText: "ab" })).ok).toBe(false);
  });

  it("un motivo fuera de la lista o vacío da error", () => {
    expect(parseCancelInput(form({ cancelReason: "INVENTADO" })).ok).toBe(false);
    expect(parseCancelInput(form({})).ok).toBe(false);
  });

  it("solo guarda el texto con Otro y las notas son opcionales", () => {
    const result = parseCancelInput(form({ cancelReason: "NO_CONTESTO", cancelReasonText: "x", cancelNotes: "  " }));
    expect(result).toEqual({ ok: true, value: { reason: "NO_CONTESTO", reasonText: null, notas: null } });
  });

  it("arma la nota del historial", () => {
    expect(cancelNote({ reason: "CLIENTA_CANCELO", reasonText: null, notas: null })).toBe(
      "Motivo: La clienta decidió cancelar.",
    );
    expect(cancelNote({ reason: "OTRO", reasonText: "Se mudó", notas: "Llamar" })).toBe(
      "Motivo: Otro — Se mudó. Notas: Llamar",
    );
  });
});

describe("cancelBlock", () => {
  it("bloquea con un despacho PENDING o SHIPPED", () => {
    expect(cancelBlock([{ status: "PENDING" }])).toBe(CANCEL_BLOCK_DISPATCH);
    expect(cancelBlock([{ status: "CANCELLED" }, { status: "SHIPPED" }])).toBe(CANCEL_BLOCK_DISPATCH);
    expect(CANCEL_BLOCK_DISPATCH).toBe("Tiene un despacho activo: usa Registrar devolución");
  });

  it("no bloquea con despachos cancelados o devueltos, ni sin despachos", () => {
    expect(cancelBlock([{ status: "CANCELLED" }, { status: "RETURNED" }])).toBeNull();
    expect(cancelBlock([])).toBeNull();
  });
});

describe("openManufacturingOrders", () => {
  it("devuelve solo las OF sin recibir", () => {
    const ofs = [
      { code: "OF-1", receivedAt: null },
      { code: "OF-2", receivedAt: new Date("2026-11-01T15:00:00Z") },
    ];
    expect(openManufacturingOrders(ofs).map((of) => of.code)).toEqual(["OF-1"]);
  });
});

describe("hasPayments", () => {
  it("verdadero con un abono o con anticipo mayor que 0", () => {
    expect(hasPayments({ salePayments: [{}], downPaymentAmount: 0 })).toBe(true);
    expect(hasPayments({ salePayments: [], downPaymentAmount: "150000.00" })).toBe(true);
  });

  it("falso sin abonos ni anticipo, o sin venta", () => {
    expect(hasPayments({ salePayments: [], downPaymentAmount: "0" })).toBe(false);
    expect(hasPayments(null)).toBe(false);
  });
});

describe("parseReactivateInput", () => {
  it("rechaza vacío o menos de 3 letras", () => {
    expect(parseReactivateInput(form({})).ok).toBe(false);
    expect(parseReactivateInput(form({ reactivateReason: "  " })).ok).toBe(false);
    expect(parseReactivateInput(form({ reactivateReason: "no" })).ok).toBe(false);
  });
  it("acepta «Se equivocó» y quita espacios", () => {
    expect(parseReactivateInput(form({ reactivateReason: "  Se equivocó " }))).toEqual({ ok: true, motivo: "Se equivocó" });
  });
  it("rechaza más de 200 letras", () => {
    expect(parseReactivateInput(form({ reactivateReason: "a".repeat(201) })).ok).toBe(false);
  });
});

describe("estadoAlReactivar", () => {
  const h = (fromStatus: string | null, toStatus: string, dia: number) => ({
    fromStatus,
    toStatus,
    createdAt: new Date(Date.UTC(2026, 10, dia, 15)),
  });
  it("sin historial vuelve a RELEASED", () => {
    expect(estadoAlReactivar([])).toBe("RELEASED");
  });
  it("vuelve al estado de antes de la última cancelación, venga como venga el orden", () => {
    const historial = [
      h(null, "DRAFT", 1),
      h("DRAFT", "CANCELLED", 2),
      h("CANCELLED", "DRAFT", 3),
      h("DRAFT", "IN_PRODUCTION", 4),
      h("IN_PRODUCTION", "CANCELLED", 5),
    ];
    expect(estadoAlReactivar(historial)).toBe("IN_PRODUCTION");
    expect(estadoAlReactivar([...historial].reverse())).toBe("IN_PRODUCTION");
  });
  it("sin fromStatus o con CANCELLED vuelve a RELEASED", () => {
    expect(estadoAlReactivar([h(null, "CANCELLED", 1)])).toBe("RELEASED");
    expect(estadoAlReactivar([h("CANCELLED", "CANCELLED", 1)])).toBe("RELEASED");
  });
  it("ultimaCancelacion da la entrada más nueva a CANCELLED", () => {
    const historial = [
      { ...h("DRAFT", "CANCELLED", 2), note: "vieja" },
      { ...h("RELEASED", "CANCELLED", 6), note: "nueva" },
      { ...h("CANCELLED", "RELEASED", 4), note: null },
    ];
    expect(ultimaCancelacion(historial)?.note).toBe("nueva");
    expect(ultimaCancelacion([])).toBeNull();
  });
});

describe("stockToRetake", () => {
  const reversa = (productId: string, change: number, code = "ORD-00010") => ({
    productId,
    change,
    note: `Reversa por cancelacion de orden ${code}`,
  });
  const reactiva = (productId: string, change: number) => ({ productId, change, note: "Reactivación de orden ORD-00010" });
  it("saca lo que entró al cancelar, solo de esa orden", () => {
    const res = stockToRetake([reversa("a", 2), reversa("b", 1), reversa("a", 5, "ORD-00011")], "ORD-00010");
    expect([...res]).toEqual([["a", 2], ["b", 1]]);
  });
  it("con varias cancelaciones no resta dos veces", () => {
    const res = stockToRetake([reversa("a", 2), reactiva("a", -2), reversa("a", 2)], "ORD-00010");
    expect([...res]).toEqual([["a", 2]]);
    expect(stockToRetake([reversa("a", 2), reactiva("a", -2)], "ORD-00010").size).toBe(0);
  });
});

describe("closedOrderMessage", () => {
  it("cancelada da el mensaje nuevo; cerrada, el de siempre", () => {
    expect(closedOrderMessage("CANCELLED", "La orden no admite cambios")).toBe(ORDER_CANCELLED_BLOCK);
    expect(ORDER_CANCELLED_BLOCK).toBe("La orden está cancelada: reactívala primero");
    expect(closedOrderMessage("COMPLETED", "La orden no admite cambios")).toBe("La orden no admite cambios");
  });
});

describe("motivoDeCancelacion", () => {
  it("lee la nota del historial (etiqueta, texto y notas)", () => {
    const note = cancelNote({ reason: "OTRO", reasonText: "Se mudó. Lejos", notas: "Llamar el lunes" });
    expect(motivoDeCancelacion(note, null)).toEqual({ clave: "OTRO", etiqueta: "Otro", texto: "Se mudó. Lejos", notas: "Llamar el lunes" });
    expect(motivoDeCancelacion(cancelNote({ reason: "NO_CONTESTO", reasonText: null, notas: null }), null)).toEqual({
      clave: "NO_CONTESTO",
      etiqueta: "La clienta no contestó",
      texto: null,
      notas: null,
    });
  });

  it("sin nota reconocible usa la bitácora", () => {
    const after = { status: "CANCELLED", motivo: "Otro — Duplicada", motivoClave: "OTRO", notas: "Ver ORD-2" };
    expect(motivoDeCancelacion(null, after)).toEqual({ clave: "OTRO", etiqueta: "Otro", texto: "Duplicada", notas: "Ver ORD-2" });
    expect(motivoDeCancelacion("Cancelada a mano", after).clave).toBe("OTRO");
  });

  it("sin ninguno de los dos: Sin dato", () => {
    expect(motivoDeCancelacion(null, null)).toEqual({ clave: "SIN_DATO", etiqueta: "Sin dato", texto: null, notas: null });
    expect(motivoDeCancelacion("Motivo: Algo raro.", { status: "CANCELLED" }).clave).toBe("SIN_DATO");
  });
});

describe("filtrarCanceladas y resumenCanceladas", () => {
  const fila = (orderCode: string, fecha: string, clave: string, tieneCobros = false): CanceladaFila => ({
    orderId: orderCode,
    orderCode,
    saleCode: null,
    clienta: "Ana",
    productos: "1 × Silla",
    asesora: "Ingrid",
    motivo: motivoDeCancelacion(null, clave === "SIN_DATO" ? null : { motivoClave: clave }),
    canceladoPor: "Admin",
    fecha: new Date(fecha),
    tieneCobros,
  });
  // 1-nov 03:00Z = 31-oct 22:00 en Colombia; 1-nov 05:00Z = 1-nov 00:00 en Colombia.
  const filas = [
    fila("ORD-00001", "2026-11-01T03:00:00Z", "NO_CONTESTO", true),
    fila("ORD-00002", "2026-11-01T05:00:00Z", "NO_CONTESTO"),
    fila("ORD-00003", "2026-11-05T15:00:00Z", "SIN_DATO", true),
  ];

  it("filtra por mes de Colombia y por motivo, la más reciente primero", () => {
    expect(filtrarCanceladas(filas, { mes: "2026-10", motivo: null }).map((f) => f.orderCode)).toEqual(["ORD-00001"]);
    expect(filtrarCanceladas(filas, { mes: "2026-11", motivo: null }).map((f) => f.orderCode)).toEqual(["ORD-00003", "ORD-00002"]);
    expect(filtrarCanceladas(filas, { mes: null, motivo: "NO_CONTESTO" }).map((f) => f.orderCode)).toEqual(["ORD-00002", "ORD-00001"]);
    expect(filtrarCanceladas(filas, { mes: null, motivo: "SIN_DATO" }).map((f) => f.orderCode)).toEqual(["ORD-00003"]);
  });

  it("resume cantidad, con cobros y por motivo", () => {
    expect(resumenCanceladas(filas)).toEqual({
      cantidad: 3,
      conCobros: 2,
      porMotivo: [
        { etiqueta: "La clienta no contestó", cantidad: 2 },
        { etiqueta: "Sin dato", cantidad: 1 },
      ],
    });
    expect(resumenCanceladas([])).toEqual({ cantidad: 0, conCobros: 0, porMotivo: [] });
  });

  it("parseFiltrosCanceladas descarta valores raros", () => {
    expect(parseFiltrosCanceladas({ mes: "2026-11", motivo: "OTRO" })).toEqual({ mes: "2026-11", motivo: "OTRO" });
    expect(parseFiltrosCanceladas({ mes: "2026-13", motivo: "X" })).toEqual({ mes: null, motivo: null });
    expect(parseFiltrosCanceladas({ mes: ["2026-10", "x"], motivo: "SIN_DATO" })).toEqual({ mes: "2026-10", motivo: "SIN_DATO" });
  });
});
