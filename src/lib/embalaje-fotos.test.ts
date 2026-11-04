import { describe, expect, it } from "vitest";
import {
  DEMASIADAS_FOTOS,
  FALTA_ABIERTO,
  FALTA_CERRADO,
  FALTAN_LAS_DOS,
  fotosEmbalajeParaVer,
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

describe("fotosEmbalajeParaVer", () => {
  it("quita LLEGADA y ordena ABIERTO → CERRADO → EXTRA, la más vieja primero", () => {
    const d = (n: number) => new Date(Date.UTC(2026, 10, 4, 15, n));
    const fotos = [
      { id: "e2", tipo: "EXTRA" as const, createdAt: d(5) },
      { id: "l1", tipo: "LLEGADA" as const, createdAt: d(0) },
      { id: "c1", tipo: "CERRADO" as const, createdAt: d(1) },
      { id: "e1", tipo: "EXTRA" as const, createdAt: d(2) },
      { id: "a2", tipo: "ABIERTO" as const, createdAt: d(4) },
      { id: "a1", tipo: "ABIERTO" as const, createdAt: d(3) },
    ];
    expect(fotosEmbalajeParaVer(fotos).map((f) => f.id)).toEqual(["a1", "a2", "c1", "e1", "e2"]);
    expect(fotos).toHaveLength(6);
  });
});
