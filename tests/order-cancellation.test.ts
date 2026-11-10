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
