import { describe, expect, it } from "vitest";
import { hexDeAcabado, leerAcabadosHex, partesParaRecolorear } from "./product-parts";

describe("hexDeAcabado", () => {
  it("usa el hex guardado (sin importar tildes ni mayúsculas)", () => {
    expect(hexDeAcabado("dorada", { Dorada: "#AA8800" })).toBe("#AA8800");
  });
  it("sin guardado usa el de fábrica", () => {
    expect(hexDeAcabado("Cromado Dorado", {})).toBe("#D4B26A");
    expect(hexDeAcabado("CROMADA", {})).toBe("#C0C0C0");
    expect(hexDeAcabado("Négro", {})).toBe("#1C1C1C");
  });
  it("sin guardado ni de fábrica: null", () => {
    expect(hexDeAcabado("Madera", {})).toBeNull();
    expect(hexDeAcabado("", {})).toBeNull();
  });
});

describe("leerAcabadosHex", () => {
  it("descarta lo que no es #RRGGBB y pasa a mayúsculas", () => {
    expect(leerAcabadosHex({ Dorada: "#c9a24a", Negra: "negro", Blanca: "#FFF" })).toEqual({ Dorada: "#C9A24A" });
    expect(leerAcabadosHex(null)).toEqual({});
    expect(leerAcabadosHex(["#FFFFFF"])).toEqual({});
  });
});

describe("partesParaRecolorear", () => {
  const partes = [
    { nombre: "Tapizado", tipo: "CARTA" as const, mascaraUrl: "/uploads/mascaras/t.png", acabadosHex: null },
    { nombre: "Base", tipo: "ACABADOS" as const, mascaraUrl: "/uploads/mascaras/b.png", acabadosHex: { Dorada: "#AA8800" } },
  ];
  const crema = { parte: "Tapizado", color: "Crema", colorFotoUrl: "https://crm.magilus.com/c.jpg", hex: "" };

  it("acabado con su hex de la base y carta con la foto si no trae hex", () => {
    expect(partesParaRecolorear(partes, [crema, { parte: "base", color: "Dorada", colorFotoUrl: "", hex: "#000000" }])).toEqual([
      { mascara: "/uploads/mascaras/t.png", hex: null, texturaUrl: "https://crm.magilus.com/c.jpg" },
      { mascara: "/uploads/mascaras/b.png", hex: "#AA8800", texturaUrl: null },
    ]);
  });
  it("carta con hex usa el hex", () => {
    const lista = partesParaRecolorear(partes, [{ ...crema, hex: "#EEDDCC" }, { parte: "Base", color: "Negra", colorFotoUrl: "", hex: "" }]);
    expect(lista?.map((p) => p.hex)).toEqual(["#EEDDCC", "#1C1C1C"]);
  });
  it("null si falta máscara, color, o queda en Por definir o sin hex", () => {
    const base = { parte: "Base", color: "Dorada", colorFotoUrl: "", hex: "" };
    expect(partesParaRecolorear([{ ...partes[0], mascaraUrl: null }, partes[1]], [crema, base])).toBeNull();
    expect(partesParaRecolorear(partes, [crema])).toBeNull();
    expect(partesParaRecolorear(partes, [crema, { ...base, color: "Por definir" }])).toBeNull();
    expect(partesParaRecolorear(partes, [crema, { ...base, color: "Madera" }])).toBeNull();
    expect(partesParaRecolorear(partes, [{ ...crema, colorFotoUrl: "" }, base])).toBeNull();
    expect(partesParaRecolorear([], [])).toBeNull();
  });
});
