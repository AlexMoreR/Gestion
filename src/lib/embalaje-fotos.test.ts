import { describe, expect, it } from "vitest";
import {
  DEMASIADAS_FOTOS,
  FALTA_ABIERTO,
  FALTA_CERRADO,
  FALTAN_LAS_DOS,
  validarFotosEmbalaje,
} from "./embalaje-fotos";

describe("validarFotosEmbalaje", () => {
  it("faltan las dos", () => {
    expect(validarFotosEmbalaje({ existentes: [], nuevas: [] })).toBe(FALTAN_LAS_DOS);
    expect(validarFotosEmbalaje({ existentes: [], nuevas: ["EXTRA"] })).toBe(FALTAN_LAS_DOS);
  });

  it("falta una", () => {
    expect(validarFotosEmbalaje({ existentes: [], nuevas: ["CERRADO"] })).toBe(FALTA_ABIERTO);
    expect(validarFotosEmbalaje({ existentes: [], nuevas: ["ABIERTO", "EXTRA"] })).toBe(FALTA_CERRADO);
  });

  it("vale con las dos, sumando las que ya existían", () => {
    expect(validarFotosEmbalaje({ existentes: [], nuevas: ["ABIERTO", "CERRADO"] })).toBeNull();
    expect(validarFotosEmbalaje({ existentes: ["ABIERTO"], nuevas: ["CERRADO"] })).toBeNull();
    expect(validarFotosEmbalaje({ existentes: ["ABIERTO", "CERRADO"], nuevas: [] })).toBeNull();
  });

  it("más de 5 no se acepta; LLEGADA no cuenta", () => {
    expect(
      validarFotosEmbalaje({ existentes: ["ABIERTO", "CERRADO"], nuevas: ["EXTRA", "EXTRA", "EXTRA"] }),
    ).toBeNull();
    expect(
      validarFotosEmbalaje({ existentes: ["ABIERTO", "CERRADO", "EXTRA"], nuevas: ["EXTRA", "EXTRA", "EXTRA"] }),
    ).toBe(DEMASIADAS_FOTOS);
    expect(
      validarFotosEmbalaje({ existentes: ["LLEGADA", "ABIERTO", "CERRADO"], nuevas: ["EXTRA", "EXTRA", "EXTRA"] }),
    ).toBeNull();
  });
});
