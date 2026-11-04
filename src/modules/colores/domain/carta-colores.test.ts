import { describe, expect, it } from "vitest";
import {
  agruparCartaPublica,
  etiquetaColor,
  mensajeWhatsAppColor,
  validarColor,
  type ColorCarta,
  type MaterialCarta,
} from "./carta-colores";

describe("validarColor", () => {
  it("acepta un color válido, con o sin hex", () => {
    expect(validarColor({ codigo: "03", nombre: "Palo rosa", hex: "#c48a8f" })).toEqual([]);
    expect(validarColor({ codigo: "03", nombre: "Palo rosa", hex: "" })).toEqual([]);
    expect(validarColor({ codigo: "03", nombre: "Palo rosa", hex: null })).toEqual([]);
    expect(validarColor({ codigo: "1234567890", nombre: "Ab" })).toEqual([]);
  });

  it("rechaza código vacío, largo o con espacios a los lados", () => {
    expect(validarColor({ codigo: "", nombre: "Palo rosa" })).toEqual(["El código es obligatorio"]);
    expect(validarColor({ codigo: "   ", nombre: "Palo rosa" })).toEqual(["El código es obligatorio"]);
    expect(validarColor({ codigo: " 03", nombre: "Palo rosa" })).toEqual([
      "El código no puede empezar ni terminar con espacios",
    ]);
    expect(validarColor({ codigo: "12345678901", nombre: "Palo rosa" })).toEqual([
      "El código debe tener máximo 10 caracteres",
    ]);
  });

  it("mide el nombre sin los espacios de los lados", () => {
    expect(validarColor({ codigo: "03", nombre: " A " })).toEqual(["El nombre debe tener entre 2 y 60 caracteres"]);
    expect(validarColor({ codigo: "03", nombre: "x".repeat(61) })).toHaveLength(1);
    expect(validarColor({ codigo: "03", nombre: ` ${"x".repeat(60)} ` })).toEqual([]);
  });

  it("rechaza un hex mal escrito", () => {
    for (const hex of ["c48a8f", "#c48a8", "#GGGGGG", "#c48a8f0"]) {
      expect(validarColor({ codigo: "03", nombre: "Palo rosa", hex })).toEqual([
        "El color de muestra debe ser como #A1B2C3",
      ]);
    }
  });
});

describe("etiqueta y mensaje de WhatsApp", () => {
  const prana = { nombre: "Prana" };
  const color = { codigo: "03", nombre: "Palo rosa" };

  it("arma la etiqueta", () => {
    expect(etiquetaColor(prana, color)).toBe("Prana 03 · Palo rosa");
  });

  it("arma el mensaje exacto, con tildes", () => {
    expect(mensajeWhatsAppColor(prana, color)).toBe("Hola, me gustó el color Prana 03 Palo rosa");
    expect(mensajeWhatsAppColor({ nombre: "Telas" }, { codigo: "7", nombre: "Limón" })).toBe(
      "Hola, me gustó el color Telas 7 Limón",
    );
  });
});

describe("agruparCartaPublica", () => {
  const mat = (id: string, grupo: "CUERO" | "TELA", orden: number, oculto = false): MaterialCarta => ({
    id,
    nombre: id,
    grupo,
    orden,
    oculto,
  });
  const col = (materialId: string, codigo: string, orden = 0, oculto = false): ColorCarta => ({
    id: `${materialId}-${codigo}`,
    materialId,
    codigo,
    nombre: `Color ${codigo}`,
    oculto,
    orden,
  });

  it("agrupa Cueros y Telas con materiales en orden y colores por orden y código natural", () => {
    const grupos = agruparCartaPublica(
      [mat("Telas", "TELA", 4), mat("Prana", "CUERO", 2), mat("Cuerotex", "CUERO", 1)],
      [col("Prana", "10"), col("Prana", "2"), col("Prana", "01", 0), col("Prana", "99", -1), col("Telas", "5")],
    );
    expect(grupos.map((g) => g.titulo)).toEqual(["Cueros", "Telas"]);
    expect(grupos[0].materiales.map((m) => m.nombre)).toEqual(["Cuerotex", "Prana"]);
    expect(grupos[0].materiales[0].colores).toEqual([]); // material visible sin colores sale vacío
    expect(grupos[0].materiales[1].colores.map((c) => c.codigo)).toEqual(["99", "01", "2", "10"]);
    expect(grupos[1].materiales[0].colores.map((c) => c.codigo)).toEqual(["5"]);
  });

  it("no muestra colores ocultos ni materiales ocultos (ni sus colores) y quita grupos vacíos", () => {
    const grupos = agruparCartaPublica(
      [mat("Prana", "CUERO", 2), mat("Telas", "TELA", 4, true)],
      [col("Prana", "03"), col("Prana", "04", 0, true), col("Telas", "5")],
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].grupo).toBe("CUERO");
    expect(grupos[0].materiales[0].colores.map((c) => c.codigo)).toEqual(["03"]);
  });
});
