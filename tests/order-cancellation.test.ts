import { describe, expect, it } from "vitest";
import {
  CANCEL_BLOCK_DISPATCH,
  CANCEL_REASONS,
  cancelBlock,
  cancelNote,
  hasPayments,
  openManufacturingOrders,
  parseCancelInput,
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
