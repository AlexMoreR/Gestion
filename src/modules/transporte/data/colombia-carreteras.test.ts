import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import carreteras from "./colombia-carreteras.json";
import mapa from "./colombia-mapa.json";

// Puntos absolutos ("M x y") de cada línea de un path relativo.
function inicios(d: string): number[][] {
  return [...d.matchAll(/M(-?[\d.]+)[ ,]?(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe("colombia-carreteras.json", () => {
  it("usa la misma proyección del mapa de municipios", () => {
    expect(carreteras.viewBox).toBe(mapa.viewBox);
    expect(carreteras.recuadroSanAndres.viewBox).toBe(mapa.recuadroSanAndres.viewBox);
  });

  it("trae los tres niveles como paths SVG, con su fuente", () => {
    for (const d of [carreteras.principales, carreteras.secundarias, carreteras.terciarias]) {
      expect(d).toMatch(/^M[-.\d]/);
    }
    expect(carreteras.fuente).toContain("OpenStreetMap");
  });

  it("todas las líneas empiezan dentro del mapa", () => {
    const [, , ancho, alto] = mapa.viewBox.split(" ").map(Number);
    for (const d of [carreteras.principales, carreteras.secundarias, carreteras.terciarias]) {
      for (const [x, y] of inicios(d)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(ancho);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(alto);
      }
    }
  });

  it("pesa menos de 500 KB", () => {
    expect(statSync(join(__dirname, "colombia-carreteras.json")).size).toBeLessThan(500 * 1024);
  });
});
