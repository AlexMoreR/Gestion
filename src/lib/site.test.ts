import { describe, expect, it } from "vitest";
import { buildWhatsAppBuyMessage, buildWhatsAppQuoteMessage, SALES_LINE_WHATSAPP, WEB_ORIGIN_TAG } from "./site";

describe("buildWhatsAppBuyMessage", () => {
  it("mensaje corto con nombre en mayuscula inicial y codigo", () => {
    expect(buildWhatsAppBuyMessage("Magilus", "CAMILLA HIDRAULICA", "CAV016")).toBe(
      "Hola, vengo de magilus.com 👋\nMe interesa la *Camilla Hidraulica* (CAV016)",
    );
  });

  it("sin codigo solo el nombre, sin espacios dobles", () => {
    expect(buildWhatsAppBuyMessage("Magilus", "SILLA  ROYAL", null)).toBe(
      "Hola, vengo de magilus.com 👋\nMe interesa la *Silla Royal*",
    );
  });

  it("no lleva precio ni enlace y siempre dice que viene de la pagina (medicion del CRM)", () => {
    for (const text of [
      buildWhatsAppBuyMessage("Magilus", "COMBO", "CMB007"),
      buildWhatsAppBuyMessage("Magilus", "silla barbera", undefined),
    ]) {
      expect(text).not.toContain("$");
      expect(text).not.toContain("http");
      expect(text).toContain(WEB_ORIGIN_TAG);
    }
  });
});

describe("buildWhatsAppQuoteMessage", () => {
  it("inicio: solo dice que viene de magilus.com", () => {
    expect(buildWhatsAppQuoteMessage("Magilus")).toBe(
      "Hola Magilus, vengo de magilus.com y quiero cotizar mobiliario profesional",
    );
  });

  it("categoria: dice de cual", () => {
    expect(buildWhatsAppQuoteMessage("Magilus", " Camillas ")).toBe(
      "Hola Magilus, vengo de magilus.com (Camillas) y quiero cotizar mobiliario profesional",
    );
  });
});

describe("SALES_LINE_WHATSAPP", () => {
  it("mantiene los números de Ventas 1 y Ventas 2 (los usa /cobertura)", () => {
    expect(SALES_LINE_WHATSAPP).toEqual({ "1": "573169831667", "2": "573205138377" });
  });
});
