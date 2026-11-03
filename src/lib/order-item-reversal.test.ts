import { describe, expect, it } from "vitest";
import {
  countReversedItems,
  itemDeliveryState,
  parseReversalInput,
  REVERSAL_REASONS,
  reversalLine,
  reversalMoneyWarning,
} from "./order-item-reversal";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseReversalInput", () => {
  it("tiene los 8 motivos", () => {
    expect(REVERSAL_REASONS.map((r) => r.key)).toEqual([
      "NO_LLEGO", "DANADO", "EQUIVOCADO", "FALTAN_PIEZAS", "RECHAZADO", "A_PROVEEDORA", "ERROR", "OTRO",
    ]);
  });

  it("sin motivo falla", () => {
    expect(parseReversalInput(form({}))).toEqual({ ok: false, error: "Elige el motivo." });
    expect(parseReversalInput(form({ reversalReason: "  " })).ok).toBe(false);
  });

  it("motivo fuera de la lista falla", () => {
    expect(parseReversalInput(form({ reversalReason: "INVENTADO" })).ok).toBe(false);
  });

  it("OTRO sin texto o con 2 letras falla", () => {
    expect(parseReversalInput(form({ reversalReason: "OTRO" })).ok).toBe(false);
    expect(parseReversalInput(form({ reversalReason: "OTRO", reversalReasonText: "  ab  " })).ok).toBe(false);
  });

  it("OTRO con texto pasa", () => {
    expect(parseReversalInput(form({ reversalReason: "OTRO", reversalReasonText: " Se mojó " }))).toEqual({
      ok: true,
      value: { reason: "OTRO", reasonText: "Se mojó", comment: null },
    });
  });

  it("Llegó dañado con o sin comentario pasa", () => {
    expect(parseReversalInput(form({ reversalReason: "DANADO" }))).toEqual({
      ok: true,
      value: { reason: "DANADO", reasonText: null, comment: null },
    });
    expect(parseReversalInput(form({ reversalReason: "DANADO", reversalComment: " pata rota ", reversalReasonText: "x" }))).toEqual({
      ok: true,
      value: { reason: "DANADO", reasonText: null, comment: "pata rota" },
    });
  });

  it("comentario de 501 letras falla", () => {
    expect(parseReversalInput(form({ reversalReason: "DANADO", reversalComment: "a".repeat(501) })).ok).toBe(false);
    expect(parseReversalInput(form({ reversalReason: "DANADO", reversalComment: "a".repeat(500) })).ok).toBe(true);
  });
});

describe("reversalLine", () => {
  it("incluye etiqueta, texto de Otro y comentario", () => {
    expect(
      reversalLine({ action: "Entrega deshecha", fromState: "ENTREGADO", toState: "DESPACHADO", reason: "DANADO", comment: "pata rota" }),
    ).toBe("Entrega deshecha (ENTREGADO → DESPACHADO): Llegó dañado — pata rota");
    expect(
      reversalLine({ action: "Entrega deshecha", fromState: "ENTREGADO", toState: "DESPACHADO", reason: "OTRO", reasonText: "Se mojó" }),
    ).toBe("Entrega deshecha (ENTREGADO → DESPACHADO): Otro: Se mojó");
  });

  it("arma la frase del despacho reversado", () => {
    expect(
      reversalLine({ action: "Despacho reversado", fromState: "DESPACHADO", toState: "POR_DESPACHAR", reason: "DANADO" }),
    ).toBe("Despacho reversado (DESPACHADO → POR_DESPACHAR): Llegó dañado");
  });
});

describe("itemDeliveryState", () => {
  it("despacho entregado y sin reversa → ENTREGADO", () => {
    expect(itemDeliveryState({ dispatchStatus: "DELIVERED", deliveryReversedAt: null })).toBe("ENTREGADO");
  });
  it("despacho entregado pero producto reversado → DESPACHADO", () => {
    expect(itemDeliveryState({ dispatchStatus: "DELIVERED", deliveryReversedAt: new Date("2026-11-03T15:00:00Z") })).toBe(
      "DESPACHADO",
    );
  });
  it("despacho enviado sin reversa → DESPACHADO", () => {
    expect(itemDeliveryState({ dispatchStatus: "SHIPPED", deliveryReversedAt: null })).toBe("DESPACHADO");
  });
});

describe("countReversedItems", () => {
  const at = new Date("2026-11-03T15:00:00Z");
  it("cuenta una vez por producto solo las líneas DELIVERED reversadas", () => {
    expect(
      countReversedItems([
        { orderItemId: "a", dispatchStatus: "DELIVERED", deliveryReversedAt: at },
        { orderItemId: "a", dispatchStatus: "DELIVERED", deliveryReversedAt: at },
        { orderItemId: "b", dispatchStatus: "DELIVERED", deliveryReversedAt: null },
        { orderItemId: "c", dispatchStatus: "SHIPPED", deliveryReversedAt: at },
      ]),
    ).toBe(1);
  });
  it("al volver a entregar (columna NULL) ya no cuenta", () => {
    expect(countReversedItems([{ orderItemId: "a", dispatchStatus: "DELIVERED", deliveryReversedAt: null }])).toBe(0);
  });
});

describe("reversalMoneyWarning", () => {
  it("contraentrega, COMPLETED y 1 reversado → aviso", () => {
    expect(reversalMoneyWarning({ paymentMethod: "CONTRAENTREGA", orderStatus: "COMPLETED", reversedItems: 1 })).toBe(
      "Esta venta ya cuenta en Balances y tiene 1 producto(s) reversado(s). El dinero, los fletes y las comisiones no se recalculan solos: administración decide",
    );
  });
  it("venta 50/50 → sin aviso", () => {
    expect(reversalMoneyWarning({ paymentMethod: "ANTICIPO_50_50", orderStatus: "COMPLETED", reversedItems: 1 })).toBeNull();
  });
  it("orden que no está COMPLETED → sin aviso", () => {
    expect(reversalMoneyWarning({ paymentMethod: "CONTRAENTREGA", orderStatus: "DISPATCHED", reversedItems: 1 })).toBeNull();
  });
  it("0 reversados → sin aviso", () => {
    expect(reversalMoneyWarning({ paymentMethod: "CONTRAENTREGA", orderStatus: "COMPLETED", reversedItems: 0 })).toBeNull();
  });
});
