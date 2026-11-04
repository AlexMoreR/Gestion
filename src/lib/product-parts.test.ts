import { describe, expect, it } from "vitest";
import { limpiarLista, opcionesDeParte, resolverPartes, textoColores } from "./product-parts";
import type { CartaMaterial } from "./carta-colores-crm";

const tapizado = { nombre: "Tapizado", tipo: "CARTA" as const, materiales: ["Cuero", "Tela"], acabados: [], orden: 0 };
const estructura = { nombre: "Estructura", tipo: "ACABADOS" as const, materiales: [], acabados: ["Cromada", "Dorada", "Negra"], orden: 1 };

const carta: CartaMaterial[] = [
  { nombre: "Cuero", colores: [{ codigo: "C1", nombre: "Crema", fotoUrl: "" }] },
  { nombre: "Prana", colores: [{ codigo: "P1", nombre: "Gris", fotoUrl: "" }] },
  { nombre: "Tela", colores: [{ codigo: "T1", nombre: "Azul", fotoUrl: "", hex: "#0000FF" }] },
];

describe("resolverPartes", () => {
  it("un producto sin partes hereda las de la categoría, en orden", () => {
    expect(resolverPartes([estructura, tapizado], []).map((p) => p.nombre)).toEqual(["Tapizado", "Estructura"]);
  });

  it("un producto con partes usa solo las suyas", () => {
    const propia = { ...tapizado, nombre: "Cojín", orden: 0 };
    expect(resolverPartes([tapizado, estructura], [propia])).toEqual([propia]);
  });
});

describe("opcionesDeParte", () => {
  it("CARTA muestra solo los colores de sus materiales", () => {
    expect(opcionesDeParte(tapizado, carta)).toEqual([
      { tipo: "CARTA", material: "Cuero", color: { codigo: "C1", nombre: "Crema", fotoUrl: "" } },
      { tipo: "CARTA", material: "Tela", color: { codigo: "T1", nombre: "Azul", fotoUrl: "", hex: "#0000FF" } },
    ]);
  });

  it("ACABADOS devuelve su lista", () => {
    expect(opcionesDeParte(estructura, carta)).toEqual([
      { tipo: "ACABADOS", acabado: "Cromada" },
      { tipo: "ACABADOS", acabado: "Dorada" },
      { tipo: "ACABADOS", acabado: "Negra" },
    ]);
  });
});

describe("textoColores", () => {
  it("une parte y color, y dice 'Por definir' si falta", () => {
    expect(textoColores([{ parte: "Tapizado", color: "Crema" }, { parte: "Base", color: "Dorada" }])).toBe(
      "Tapizado: Crema · Base: Dorada",
    );
    expect(textoColores([{ parte: "Tapizado", color: "Crema" }, { parte: "Base", color: " " }])).toBe(
      "Tapizado: Crema · Base: Por definir",
    );
  });
});

describe("limpiarLista", () => {
  it("quita vacíos y repetidos", () => {
    expect(limpiarLista([" Cromada", "", "cromada", "Dorada "])).toEqual(["Cromada", "Dorada"]);
  });
});
