import { describe, expect, it } from "vitest";
import { amountsMatch, evaluateReceipt, parseCopAmount, sniffReceiptMime } from "./receipt-check";

describe("parseCopAmount", () => {
  it("entiende los formatos de pesos mas comunes", () => {
    expect(parseCopAmount("$350.000")).toBe(350_000);
    expect(parseCopAmount("350000")).toBe(350_000);
    expect(parseCopAmount("350.000,50")).toBe(350_000.5);
    expect(parseCopAmount("1.250.000")).toBe(1_250_000);
    expect(parseCopAmount("350,000")).toBe(350_000);
    expect(parseCopAmount(350_000)).toBe(350_000);
  });

  it("devuelve null con texto basura o numeros invalidos", () => {
    expect(parseCopAmount("hola")).toBeNull();
    expect(parseCopAmount("")).toBeNull();
    expect(parseCopAmount(null)).toBeNull();
    expect(parseCopAmount(-5)).toBeNull();
    expect(parseCopAmount(Number.NaN)).toBeNull();
  });
});

describe("amountsMatch", () => {
  it("tolera hasta $1 de diferencia", () => {
    expect(amountsMatch(350_000, 350_000)).toBe(true);
    expect(amountsMatch(350_000, 350_001)).toBe(true);
    expect(amountsMatch(350_000, 349_999)).toBe(true);
    expect(amountsMatch(350_000, 350_002)).toBe(false);
  });
});

describe("evaluateReceipt", () => {
  const bank = { amount: 350_000, accountType: "BANK" as const };
  const cash = { amount: 350_000, accountType: "CASH" as const };

  it("rechaza una foto que no es comprobante", () => {
    expect(evaluateReceipt({ kind: "OTRO", readAmount: 350_000 }, bank).ok).toBe(false);
  });

  it("rechaza si el monto de la foto es distinto", () => {
    const result = evaluateReceipt({ kind: "TRANSFERENCIA", readAmount: 305_000 }, bank);
    expect(result).toEqual({ ok: false, reason: "La foto dice $305.000 y el gasto es de $350.000." });
  });

  it("en efectivo el mensaje habla del dinero contado", () => {
    const result = evaluateReceipt({ kind: "DINERO_EFECTIVO", readAmount: 300_000 }, cash);
    expect(result).toEqual({ ok: false, reason: "El dinero de la foto suma $300.000 y el gasto es de $350.000." });
  });

  it("dinero en efectivo y recibo firmado solo valen en cuenta de efectivo", () => {
    expect(evaluateReceipt({ kind: "DINERO_EFECTIVO", readAmount: 350_000 }, cash).ok).toBe(true);
    expect(evaluateReceipt({ kind: "RECIBO_FIRMADO", readAmount: 350_000 }, cash).ok).toBe(true);
    expect(evaluateReceipt({ kind: "DINERO_EFECTIVO", readAmount: 350_000 }, bank).ok).toBe(false);
    expect(evaluateReceipt({ kind: "RECIBO_FIRMADO", readAmount: 350_000 }, { amount: 350_000, accountType: "WALLET" }).ok).toBe(false);
  });

  it("rechaza si no se pudo leer el monto", () => {
    expect(evaluateReceipt({ kind: "FACTURA", readAmount: null }, bank).ok).toBe(false);
    expect(evaluateReceipt({ kind: "DINERO_EFECTIVO", readAmount: null }, cash).ok).toBe(false);
  });

  it("acepta una diferencia de $1 y el monto exacto", () => {
    expect(evaluateReceipt({ kind: "FACTURA", readAmount: 350_001 }, bank)).toEqual({ ok: true });
    expect(evaluateReceipt({ kind: "NEQUI_DAVIPLATA", readAmount: 350_000 }, bank)).toEqual({ ok: true });
  });
});

describe("sniffReceiptMime", () => {
  it("reconoce el tipo real por los primeros bytes", () => {
    expect(sniffReceiptMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceiptMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffReceiptMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffReceiptMime(webp)).toBe("image/webp");
  });

  it("devuelve null con basura o vacio", () => {
    expect(sniffReceiptMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(sniffReceiptMime(new Uint8Array([]))).toBeNull();
    // RIFF que no es WEBP (ej. un WAV)
    expect(sniffReceiptMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });
});
