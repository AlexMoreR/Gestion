import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import divipola from "./colombia-divipola.json";
import mapa from "./colombia-mapa.json";

// Municipios sin forma en el MGN 2018 del DANE (la fuente de scripts/transporte/generar-mapa.mjs).
const SIN_FORMA = [
  "27493", // Nuevo Belén de Bajirá: creado en 2022, después del MGN 2018.
];

const recuadro = mapa.recuadroSanAndres;
const formaDe = (codigo: string): string | undefined =>
  (mapa.municipios as Record<string, string>)[codigo] ?? (recuadro.municipios as Record<string, string>)[codigo];

describe("colombia-mapa.json", () => {
  it("cada municipio de DIVIPOLA tiene forma (en el mapa o en el recuadro), salvo la lista explícita", () => {
    const faltan = divipola.cities.map((c) => c.code).filter((c) => !formaDe(c));
    expect(faltan).toEqual(SIN_FORMA);
  });

  it("las formas son paths SVG y no hay códigos que no estén en DIVIPOLA", () => {
    const ciudades = new Set(divipola.cities.map((c) => c.code));
    for (const [codigo, d] of [...Object.entries(mapa.municipios), ...Object.entries(recuadro.municipios)]) {
      expect(ciudades.has(codigo)).toBe(true);
      expect(d).toMatch(/^M[-.\d]/);
    }
  });

  it("San Andrés y Providencia van solo en el recuadro", () => {
    expect(Object.keys(recuadro.municipios).sort()).toEqual(["88001", "88564"]);
    expect(Object.keys(mapa.municipios).some((c) => c.startsWith("88"))).toBe(false);
  });

  it("están los municipios de las puntas del país", () => {
    for (const c of ["88001", "94001", "97001", "27075", "44847"]) expect(formaDe(c)).toBeTruthy();
  });

  it("tiene la coordenada del Cabo de la Vela (Uribia, 44847) dentro del mapa", () => {
    const [, , ancho, alto] = mapa.viewBox.split(" ").map(Number);
    const punto = (mapa.centrosPoblados as Record<string, number[]>)["44847003"];
    expect(divipola.localities.find((l) => l.code === "44847003")?.name).toBe("Cabo de la Vela");
    expect(punto).toHaveLength(2);
    expect(punto[0]).toBeGreaterThan(0);
    expect(punto[0]).toBeLessThan(ancho);
    expect(punto[1]).toBeGreaterThan(0);
    expect(punto[1]).toBeLessThan(alto);
  });

  it("pesa menos de 1,5 MB", () => {
    expect(statSync(join(__dirname, "colombia-mapa.json")).size).toBeLessThan(1.5 * 1024 * 1024);
  });
});
