import { describe, expect, it } from "vitest";
import { displayCode, storedCodeCandidates, stripCodeZeros } from "./code-display";

describe("displayCode", () => {
  it("quita los ceros adelante", () => {
    expect(displayCode("OF-00035")).toBe("OF-35");
    expect(displayCode("COT-00150")).toBe("COT-150");
    expect(displayCode("SAL-00100")).toBe("SAL-100");
    expect(displayCode("sal-00081")).toBe("SAL-81");
  });

  it("deja igual lo que no es un código interno", () => {
    expect(displayCode("CAM001")).toBe("CAM001");
    expect(displayCode("MG-7K4Q2P8")).toBe("MG-7K4Q2P8");
    expect(displayCode(null)).toBeNull();
    expect(displayCode(undefined)).toBeUndefined();
  });
});

describe("storedCodeCandidates", () => {
  it("incluye la forma guardada con 5 dígitos", () => {
    expect(storedCodeCandidates("of-35")).toEqual(["OF-00035", "OF-35"]);
    expect(storedCodeCandidates("OF-00035")).toContain("OF-00035");
    expect(storedCodeCandidates("Maria")).toEqual(["Maria"]);
  });
});

describe("stripCodeZeros", () => {
  it("limpia los códigos dentro de un texto", () => {
    expect(stripCodeZeros("Creó la cotización COT-00150")).toMatch(/COT-150$/);
    expect(stripCodeZeros("Venta SAL-00081 y OF-00002 (CAM001)")).toBe("Venta SAL-81 y OF-2 (CAM001)");
  });
});

describe("nombres de los PDF", () => {
  it("van sin ceros adelante", async () => {
    const { formatInvoiceNumber, invoicePdfFileName, quotePdfFileName } = await import("./document-names");
    expect(formatInvoiceNumber("SAL-00012")).toBe("112");
    expect(invoicePdfFileName("SAL-00012")).toBe("FACTURA 112.pdf");
    expect(quotePdfFileName("COT-00150")).toBe("COTIZACION COT-150.pdf");
  });
});
