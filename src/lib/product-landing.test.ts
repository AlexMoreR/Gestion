import { describe, expect, it } from "vitest";
import {
  ASK_ADVISOR_LABEL,
  buildProductFaq,
  buildProductLandingData,
  extractMeasureFromDescription,
  hasHydraulicSystem,
  productDisplayName,
  readableDescription,
  WARRANTY_BASE_TEXT,
  WARRANTY_HYDRAULIC_TEXT,
  warrantyTextFor,
} from "./product-landing";

describe("hasHydraulicSystem", () => {
  it("categoria Sillas Hidráulicas (con y sin tilde)", () => {
    expect(hasHydraulicSystem({ name: "PRO REY", categoryName: "Sillas Hidráulicas" })).toBe(true);
    expect(hasHydraulicSystem({ name: "PRO REY", categoryName: "SILLAS HIDRAULICAS" })).toBe(true);
  });

  it("nombre con HIDRAU / hidráulica / hidraulico", () => {
    expect(hasHydraulicSystem({ name: "HIDRAU PRO REY", categoryName: "Sillas" })).toBe(true);
    expect(hasHydraulicSystem({ name: "Camilla hidráulica", categoryName: "Camillas" })).toBe(true);
    expect(hasHydraulicSystem({ name: "BUTACO HIDRAULICO", categoryName: null })).toBe(true);
  });

  it("descripcion con sistema hidraulico", () => {
    expect(
      hasHydraulicSystem({ name: "SILLA BARBERA", description: "Silla con sistema hidráulico reforzado", categoryName: "Barberia" }),
    ).toBe(true);
  });

  it("sofas, tocadores, camillas fijas y sillas neumaticas no tienen hidraulico", () => {
    expect(
      hasHydraulicSystem({ name: "SOFA CON BOTONES", description: "SALA DE ESPERA CON BOTONES MEDIDA DE 1.40", categoryName: "Salas de espera" }),
    ).toBe(false);
    expect(hasHydraulicSystem({ name: "CAMILLA CURVA LASHISTA", description: null, categoryName: "Camilla" })).toBe(false);
    expect(hasHydraulicSystem({ name: "NEUT PLATINA", categoryName: "Sillas Neumáticas" })).toBe(false);
    expect(hasHydraulicSystem({ name: "TOCADOR LED", description: "", categoryName: "Tocadores" })).toBe(false);
  });

  it("no cuenta menciones negadas ni palabras que solo contienen hidrau por dentro", () => {
    expect(hasHydraulicSystem({ name: "SILLA FIJA", description: "Silla fija sin sistema hidráulico" })).toBe(false);
    expect(hasHydraulicSystem({ name: "SILLA FIJA", description: "No hidraulica, base fija" })).toBe(false);
    expect(hasHydraulicSystem({ name: "ELECTROHIDRAULICA", description: null })).toBe(false);
  });

  it("si una mencion esta negada pero otra no, si tiene", () => {
    expect(
      hasHydraulicSystem({ name: "HIDRAU MAX", description: "Respaldo sin hidraulico, base hidraulica" }),
    ).toBe(true);
  });
});

describe("warrantyTextFor", () => {
  it("5 años en el hidraulico solo si tiene hidraulico", () => {
    expect(warrantyTextFor({ name: "HIDRAU PRO REY", categoryName: "Sillas Hidráulicas" })).toBe(WARRANTY_HYDRAULIC_TEXT);
    expect(warrantyTextFor({ name: "SOFA CON BOTONES", categoryName: "Salas de espera" })).toBe(WARRANTY_BASE_TEXT);
    expect(WARRANTY_BASE_TEXT).toBe("1 año de garantía");
    expect(WARRANTY_HYDRAULIC_TEXT).toBe("1 año de garantía y 5 años en el sistema hidráulico");
  });
});

describe("extractMeasureFromDescription", () => {
  it("lee la medida escrita sin inventar unidades", () => {
    expect(extractMeasureFromDescription("SALA DE ESPERA CON BOTONES MEDIDA DE 1.40")).toBe("1.40");
    expect(extractMeasureFromDescription("Medidas: 60 x 180 cm, tapizado")).toBe("60 x 180 cm");
    expect(extractMeasureFromDescription("Camilla de 60x180x75 cm")).toBe("60x180x75 cm");
    expect(extractMeasureFromDescription("Sofa de 1,80 m de ancho")).toBe("1,80 m");
  });

  it("null si no hay medida", () => {
    expect(extractMeasureFromDescription(null)).toBeNull();
    expect(extractMeasureFromDescription("")).toBeNull();
    expect(extractMeasureFromDescription("Silla con 5 años de garantía en el hidraulico")).toBeNull();
    expect(extractMeasureFromDescription("Combo de 2 sillas y 1 tocador")).toBeNull();
  });
});

describe("productDisplayName y readableDescription", () => {
  it("nombre en capitalizacion de oracion y abreviaturas expandidas", () => {
    expect(productDisplayName("SOFA CON BOTONES", "Salas de espera")).toBe("Sofa con botones");
    expect(productDisplayName("HIDRAU PRO REY", "Sillas Hidráulicas")).toBe("Silla hidráulica pro rey");
  });

  it("descripcion en MAYUSCULAS pasa a oracion; la que ya esta bien se respeta", () => {
    expect(readableDescription("SALA DE ESPERA CON BOTONES  MEDIDA DE 1.40")).toBe(
      "Sala de espera con botones medida de 1.40",
    );
    expect(readableDescription("Silla Pro Rey para barbería")).toBe("Silla Pro Rey para barbería");
    expect(readableDescription(null)).toBe("");
    expect(readableDescription("   ")).toBe("");
  });
});

describe("buildProductLandingData", () => {
  it("SEV001: sin hidraulico, medida de la descripcion y lo que falta a la asesora", () => {
    const data = buildProductLandingData({
      name: "SOFA CON BOTONES",
      code: "SEV001",
      description: "SALA DE ESPERA CON BOTONES MEDIDA DE 1.40",
      categoryName: "Salas de espera",
      brandName: "Magilus",
    });
    expect(data.hydraulic).toBe(false);
    expect(data.warrantyText).toBe(WARRANTY_BASE_TEXT);
    expect(data.measure).toBe("1.40");
    expect(data.chips).toEqual(["Medida 1.40", "Fábrica en Cali y Bogotá", "1 año de garantía"]);
    expect(data.specs).toEqual([
      { label: "Producto", value: "Sofa con botones (salas de espera)", missing: false },
      { label: "Medidas", value: "1.40", missing: false },
      { label: "Material y tapizado", value: ASK_ADVISOR_LABEL, missing: true },
      { label: "Garantía", value: "1 año de garantía", missing: false },
      { label: "Código", value: "SEV001", missing: false },
      { label: "Fabricante", value: "Magilus, Cali y Bogotá", missing: false },
    ]);
    expect(data.faq.find((item) => item.question.includes("garantía"))?.answer).toBe("1 año de garantía.");
  });

  it("silla hidraulica sin descripcion ni codigo: medidas a la asesora, garantia completa", () => {
    const data = buildProductLandingData({
      name: "HIDRAU PRO REY",
      code: null,
      description: null,
      categoryName: "Sillas Hidráulicas",
      brandName: "Magilus",
    });
    expect(data.hydraulic).toBe(true);
    expect(data.measure).toBeNull();
    expect(data.description).toBe("");
    expect(data.chips).toEqual(["Fábrica en Cali y Bogotá", "1 año de garantía"]);
    expect(data.specs.find((row) => row.label === "Medidas")).toEqual({
      label: "Medidas",
      value: ASK_ADVISOR_LABEL,
      missing: true,
    });
    expect(data.specs.some((row) => row.label === "Código")).toBe(false);
    expect(data.specs.find((row) => row.label === "Garantía")?.value).toBe(WARRANTY_HYDRAULIC_TEXT);
  });

  it("las preguntas frecuentes nunca prometen envio gratis", () => {
    const faq = buildProductFaq({ warrantyText: WARRANTY_HYDRAULIC_TEXT });
    expect(faq).toHaveLength(5);
    expect(faq.map((item) => `${item.question} ${item.answer}`).join(" ").toLowerCase()).not.toContain("gratis");
  });
});
