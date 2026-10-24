import { describe, expect, it } from "vitest";
import { createClaudeReceiptValidator, parseReceiptReview } from "./claude-receipt-validator";

describe("parseReceiptReview", () => {
  it("lee un JSON limpio", () => {
    expect(parseReceiptReview('{"tipo":"TRANSFERENCIA","monto":350000,"nota":"Bancolombia"}')).toEqual({
      kind: "TRANSFERENCIA",
      readAmount: 350_000,
      note: "Bancolombia",
    });
  });

  it("lee un JSON dentro de un bloque de codigo con texto alrededor", () => {
    const text = 'Claro, aqui esta:\n```json\n{"tipo":"factura","monto":"120000","nota":"x"}\n```\nListo.';
    expect(parseReceiptReview(text)).toMatchObject({ kind: "FACTURA", readAmount: 120_000 });
  });

  it("tipo desconocido -> OTRO", () => {
    expect(parseReceiptReview('{"tipo":"GATITO","monto":10}').kind).toBe("OTRO");
    expect(parseReceiptReview('{"monto":10}').kind).toBe("OTRO");
  });

  it("monto con formato de pesos y monto ilegible", () => {
    expect(parseReceiptReview('{"tipo":"RECIBO","monto":"$350.000"}').readAmount).toBe(350_000);
    expect(parseReceiptReview('{"tipo":"RECIBO","monto":null}').readAmount).toBeNull();
  });

  it("sin JSON lanza", () => {
    expect(() => parseReceiptReview("no se ve nada")).toThrow();
  });
});

describe("createClaudeReceiptValidator", () => {
  it("sin apiKey no esta configurado y revisar lanza", async () => {
    const validator = createClaudeReceiptValidator({});
    expect(validator.isConfigured()).toBe(false);
    await expect(validator.review({ bytes: new Uint8Array([1]), mime: "image/png" })).rejects.toThrow();
  });

  it("con apiKey esta configurado", () => {
    expect(createClaudeReceiptValidator({ apiKey: "sk-test" }).isConfigured()).toBe(true);
  });
});
