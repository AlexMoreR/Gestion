import { describe, expect, it } from "vitest";
import { avisosDeRecargo, faltanColores, leerRecargos, limpiarLista, opcionesDeParte, resolverPartes, textoColores } from "./product-parts";
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

describe("colores comunes primero", () => {
  const cueroTex: CartaMaterial[] = [
    {
      nombre: "Cuero tex",
      colores: [
        { codigo: "CT1", nombre: "Rojo", fotoUrl: "" },
        { codigo: "CT2", nombre: "Negro", fotoUrl: "" },
        { codigo: "CT3", nombre: "Lila", fotoUrl: "" },
        { codigo: "CT4", nombre: "Azul", fotoUrl: "" },
      ],
    },
  ];
  const parte = { tipo: "CARTA" as const, materiales: ["Cuero tex"], acabados: [] };

  it("los comunes salen primero en el orden escrito (por nombre o código) y el resto queda igual", () => {
    const nombres = opcionesDeParte({ ...parte, coloresComunes: ["lila", "CT2"] }, cueroTex).map(
      (o) => o.tipo === "CARTA" && o.color.nombre,
    );
    expect(nombres).toEqual(["Lila", "Negro", "Rojo", "Azul"]);
  });

  it("sin comunes queda el orden de la carta", () => {
    expect(opcionesDeParte(parte, cueroTex).map((o) => o.tipo === "CARTA" && o.color.codigo)).toEqual(["CT1", "CT2", "CT3", "CT4"]);
  });
});

describe("avisosDeRecargo (solo aviso, CMB005)", () => {
  const partes = [
    {
      nombre: "Tapizado",
      tipo: "CARTA" as const,
      recargos: { materiales: { Prana: 150000 } },
    },
    {
      nombre: "Estructura",
      tipo: "ACABADOS" as const,
      recargos: { acabados: { "Cromado dorado": 500000 } },
    },
  ];

  it("Prana y Cromado dorado sacan los dos avisos", () => {
    expect(
      avisosDeRecargo(partes, [
        { parte: "Tapizado", color: "Gris", colorMaterial: "prana" },
        { parte: "Estructura", color: "Cromado dorado", colorMaterial: "" },
      ]),
    ).toEqual(["Prana: +$150.000 — ajusta el precio a mano", "Cromado dorado: +$500.000 — ajusta el precio a mano"]);
  });

  it("sin recargo o en Por definir no hay aviso", () => {
    expect(
      avisosDeRecargo(partes, [
        { parte: "Tapizado", color: "Lila", colorMaterial: "Cuero tex" },
        { parte: "Estructura", color: "", colorMaterial: "" },
      ]),
    ).toEqual([]);
  });
});

describe("faltanColores", () => {
  const requeridas = ["Tapizado", "Estructura"];

  it("una parte en Por definir o sin elegir frena la venta (sin repetir por pieza del combo)", () => {
    const linea = { etiqueta: "CMB005", requeridas, elegidos: [{ parte: "Tapizado", color: "" }, { parte: "Estructura", color: "Dorado" }] };
    expect(faltanColores([linea, linea])).toEqual(["CMB005 – Tapizado"]);
    expect(faltanColores([{ etiqueta: "CMB005", requeridas, elegidos: [] }])).toEqual(["CMB005 – Tapizado", "CMB005 – Estructura"]);
    expect(faltanColores([{ ...linea, elegidos: [{ parte: "Tapizado", color: "Por definir" }, { parte: "Estructura", color: "Dorado" }] }])).toEqual([
      "CMB005 – Tapizado",
    ]);
  });

  it("con todo elegido no falta nada; una línea sin partes no pide nada", () => {
    expect(
      faltanColores([
        { etiqueta: "CMB005", requeridas, elegidos: [{ parte: "Tapizado", color: "Crema" }, { parte: "Estructura", color: "Dorado" }] },
        { etiqueta: "SIL001", requeridas: [], elegidos: [] },
      ]),
    ).toEqual([]);
  });
});

describe("leerRecargos", () => {
  it("ignora datos viejos o mal formados y deja solo números mayores a 0", () => {
    expect(leerRecargos(null)).toEqual({});
    expect(leerRecargos({ materiales: { Prana: 150000, Malo: "x", Cero: 0 }, acabados: [] })).toEqual({ materiales: { Prana: 150000 } });
  });
});
