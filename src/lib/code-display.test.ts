import { describe, expect, it } from "vitest";

import { displayCode, storedCodeCandidates, stripCodeZeros } from "./code-display";

describe("displayCode", () => {
  it("quita los ceros de adelante de los códigos del sistema", () => {
    expect(displayCode("OF-00035")).toBe("OF-35");
    expect(displayCode("SAL-00081")).toBe("SAL-81");
    expect(displayCode("COT-00150")).toBe("COT-150");
    expect(displayCode("ORD-00087")).toBe("ORD-87");
    expect(displayCode("COM-00100")).toBe("COM-100");
    expect(displayCode("PRO-00000")).toBe("PRO-0");
  });

  it("deja igual lo que no es un código del sistema", () => {
    expect(displayCode("CAM001")).toBe("CAM001");
    expect(displayCode("MG-000123")).toBe("MG-000123");
    expect(displayCode("P-03 Eliecer")).toBe("P-03 Eliecer");
    expect(displayCode("")).toBe("");
    expect(displayCode(null)).toBeNull();
  });
});

describe("stripCodeZeros", () => {
  it("limpia los códigos dentro de un texto", () => {
    expect(stripCodeZeros("Creó la cotización COT-00150 y la venta SAL-00081.")).toBe(
      "Creó la cotización COT-150 y la venta SAL-81.",
    );
    expect(stripCodeZeros("Guía MG-000123, producto CAM001")).toBe("Guía MG-000123, producto CAM001");
    expect(stripCodeZeros("XCOT-00150")).toBe("XCOT-00150");
  });
});

describe("storedCodeCandidates", () => {
  it("acepta la forma con y sin ceros", () => {
    expect(storedCodeCandidates("OF-35")).toEqual(["OF-00035", "OF-35"]);
    expect(storedCodeCandidates("of-00035")).toEqual(["OF-00035", "OF-35"]);
    expect(storedCodeCandidates("hola")).toEqual(["hola"]);
  });

  it("el orden por número no depende del formato mostrado", () => {
    const stored = ["OF-00035", "OF-00009"].sort();
    expect(stored.map((code) => displayCode(code))).toEqual(["OF-9", "OF-35"]);
  });
});

describe("nombres de documentos", () => {
  it("factura y PDF sin ceros", async () => {
    const { formatInvoiceNumber, invoicePdfFileName, quotePdfFileName } = await import("./document-names");
    expect(formatInvoiceNumber("SAL-00012")).toBe("112");
    expect(invoicePdfFileName("SAL-00012")).toBe("FACTURA 112.pdf");
    expect(quotePdfFileName("COT-00150")).toBe("COTIZACION COT-150.pdf");
  });
});

describe("MCP", () => {
  it("ver_venta acepta SAL-81, SAL-00081 y 81", async () => {
    const { normalizeSaleCode } = await import("../modules/asesor/domain/payments");
    for (const input of ["SAL-81", "SAL-00081", "81", "sal-81"]) {
      expect(normalizeSaleCode(input)).toBe("SAL-00081");
    }
  });
});
