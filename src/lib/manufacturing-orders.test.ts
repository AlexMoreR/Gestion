import { describe, expect, it, vi } from "vitest";

// Vitest no resuelve "@/": se redirigen los imports del modulo.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/quote-item-meta", async () => await import("./quote-item-meta"));
vi.mock("@/lib/manufacturing-share-token", async () => await import("./manufacturing-share-token"));

import { destinationCityLabel, supplierPaymentLabel } from "./manufacturing-orders";

describe("destinationCityLabel", () => {
  it("une ciudad y departamento", () => {
    expect(destinationCityLabel({ city: " Ocaña ", department: "Norte de Santander " })).toBe(
      "Ocaña, Norte de Santander",
    );
  });

  it("devuelve solo la ciudad si falta el departamento", () => {
    expect(destinationCityLabel({ city: "Cali", department: null })).toBe("Cali");
  });

  it("devuelve solo el departamento si falta la ciudad", () => {
    expect(destinationCityLabel({ city: "  ", department: "Valle del Cauca" })).toBe("Valle del Cauca");
  });

  it("devuelve null si los dos estan vacios o en blanco", () => {
    expect(destinationCityLabel({ city: "", department: "   " })).toBeNull();
    expect(destinationCityLabel({})).toBeNull();
  });

  it("devuelve null sin cliente", () => {
    expect(destinationCityLabel(null)).toBeNull();
    expect(destinationCityLabel(undefined)).toBeNull();
  });

  it("no usa la direccion ni el barrio aunque vengan en el objeto", () => {
    const client = { city: "Ocaña", department: "Norte de Santander", address: "Cra 1 #2-3", neighborhood: "Centro" };
    expect(destinationCityLabel(client)).toBe("Ocaña, Norte de Santander");
  });
});

describe("supplierPaymentLabel", () => {
  it("venta 50% y 50%: se paga de una vez", () => {
    expect(supplierPaymentLabel("ANTICIPO_50_50")).toBe("Pago: se te paga de una vez");
  });

  it("contraentrega: se paga cuando le llegue al cliente", () => {
    expect(supplierPaymentLabel("CONTRAENTREGA")).toBe(
      "Pago: contraentrega, se te paga cuando el producto le llegue al cliente",
    );
  });

  it("sin definir o sin venta: por confirmar", () => {
    expect(supplierPaymentLabel(null)).toBe("Pago: por confirmar");
    expect(supplierPaymentLabel(undefined)).toBe("Pago: por confirmar");
  });
});
