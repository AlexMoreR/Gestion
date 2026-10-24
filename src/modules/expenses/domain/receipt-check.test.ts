import { describe, expect, it } from "vitest";
import { formatCop, sniffReceiptMime } from "./receipt-check";

describe("formatCop", () => {
  it("formatea pesos sin decimales", () => {
    expect(formatCop(350_000)).toBe("$350.000");
    expect(formatCop(1_250_000.4)).toBe("$1.250.000");
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
