import { describe, expect, it } from "vitest";
import { conservarMascaras, esPng, MASCARA_MAX_BYTES, medidaLienzo, validarMascara } from "./mascara-parte";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const lienzo = { ancho: 800, alto: 600 };

describe("conservarMascaras", () => {
  it("cada parte con el mismo nombre conserva su máscara; las nuevas quedan sin máscara", () => {
    const antes = [
      { nombre: "Tapizado", mascaraUrl: "/uploads/mascaras/a.png" },
      { nombre: "Estructura", mascaraUrl: "/uploads/mascaras/b.png" },
    ];
    const partes = [{ nombre: "estructura" }, { nombre: "Tapizádo" }, { nombre: "Cojín" }];
    expect(conservarMascaras(antes, partes).map((p) => p.mascaraUrl)).toEqual([
      "/uploads/mascaras/b.png",
      "/uploads/mascaras/a.png",
      null,
    ]);
  });
});

describe("validarMascara", () => {
  it("acepta un PNG del tamaño del lienzo", () => {
    expect(validarMascara({ bytes: PNG, ancho: 800, alto: 600, lienzo })).toBeNull();
  });
  it("rechaza lo que no es PNG, lo vacío, lo que pesa más de 8 MB y otro tamaño", () => {
    expect(validarMascara({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0]), ancho: 800, alto: 600, lienzo })).toMatch(/PNG/);
    expect(validarMascara({ bytes: new Uint8Array(0), ancho: 800, alto: 600, lienzo })).toMatch(/vacía/);
    const grande = new Uint8Array(MASCARA_MAX_BYTES + 1);
    grande.set(PNG);
    expect(validarMascara({ bytes: grande, ancho: 800, alto: 600, lienzo })).toMatch(/8 MB/);
    expect(validarMascara({ bytes: PNG, ancho: 801, alto: 600, lienzo })).toMatch(/tamaño/);
  });
  it("esPng mira los bytes", () => {
    expect(esPng(PNG)).toBe(true);
    expect(esPng(new TextEncoder().encode("hola mundo"))).toBe(false);
  });
});

describe("medidaLienzo", () => {
  it("deja igual una foto chica y reduce una grande a 2000 px de lado mayor", () => {
    expect(medidaLienzo(1200, 900)).toEqual({ ancho: 1200, alto: 900 });
    expect(medidaLienzo(4000, 3000)).toEqual({ ancho: 2000, alto: 1500 });
  });
});
