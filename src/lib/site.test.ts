import { describe, expect, it } from "vitest";
import { buildWhatsAppBuyMessage, buildWhatsAppQuoteMessage, WEB_ORIGIN_TAG } from "./site";

describe("buildWhatsAppBuyMessage", () => {
  it("dice que viene de magilus.com, con codigo, precio y enlace de la ficha", () => {
    expect(
      buildWhatsAppBuyMessage("Magilus", "CAMILLA CURVA LASHISTA", "CAV014", {
        pageUrl: "https://magilus.com/camilla/camilla-curva-lashista-cav14",
        priceLabel: "$1.099.000",
      }),
    ).toBe(
      "Hola *Magilus*, vengo de magilus.com y quiero comprar:\n" +
        "*CAV014* CAMILLA CURVA LASHISTA ($1.099.000)\n" +
        "https://magilus.com/camilla/camilla-curva-lashista-cav14",
    );
  });

  it("sin precio ni enlace sigue sirviendo (y sin codigo solo el nombre)", () => {
    expect(buildWhatsAppBuyMessage("Magilus", "SILLA  ROYAL", null)).toBe(
      "Hola *Magilus*, vengo de magilus.com y quiero comprar:\nSILLA ROYAL",
    );
  });

  it("conserva 'quiero comprar:' y el codigo en negrita (compatibilidad con el CRM)", () => {
    const text = buildWhatsAppBuyMessage("Magilus", "COMBO", "CMB007");
    expect(text).toContain("quiero comprar:");
    expect(text).toContain("*CMB007*");
    expect(text).toContain(WEB_ORIGIN_TAG);
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
