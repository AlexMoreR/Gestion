import { describe, expect, it } from "vitest";
import { enlaceWhatsAppClienta, mensajeCotizacionActualizada } from "./quote-update-message";

const base = { code: "COT-00150", linkCotizacion: "https://magilus.com/cotizaciones/t1", linkFactura: "https://magilus.com/sales/f1" };

describe("mensajeCotizacionActualizada", () => {
  it("trae total, abonado, saldo y los dos links", () => {
    const texto = mensajeCotizacionActualizada({ ...base, total: 1_200_000, abonado: 500_000 });
    expect(texto).toContain("COT-150");
    expect(texto).toContain("Nuevo total: $1.200.000");
    expect(texto).toContain("Abonado: $500.000");
    expect(texto).toContain("Saldo pendiente: $700.000");
    expect(texto).toContain(base.linkCotizacion);
    expect(texto).toContain(base.linkFactura);
  });
  it("si el total quedó por debajo de lo abonado, dice saldo a favor", () => {
    const texto = mensajeCotizacionActualizada({ ...base, total: 300_000, abonado: 500_000, linkFactura: null });
    expect(texto).toContain("Saldo a tu favor: $200.000");
    expect(texto).not.toContain("Factura");
  });
});

describe("enlaceWhatsAppClienta", () => {
  it("un celular de 10 dígitos lleva el 57 y el texto va codificado", () => {
    expect(enlaceWhatsAppClienta("300 111 2233", "hola y adiós")).toBe("https://wa.me/573001112233?text=hola%20y%20adi%C3%B3s");
  });
  it("sin teléfono queda wa.me sin número", () => {
    expect(enlaceWhatsAppClienta(null, "x")).toBe("https://wa.me/?text=x");
  });
});
