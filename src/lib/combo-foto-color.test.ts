import { describe, expect, it } from "vitest";
import { claveColorCombo, etiquetaColorCombo, fotoExactaDelColor } from "./combo-foto-color";

const conPartes = (tapizado: string, estructura: string) => ({
  color: "",
  partes: [
    { parte: "Tapizado", color: tapizado },
    { parte: "Estructura", color: estructura },
  ],
});
const unColor = (color: string) => ({ color, partes: [] });

const fotos = [
  { claveColor: claveColorCombo([conPartes("Negro", "Blanca")])!, fotoUrl: "/uploads/combo-colores/negro-blanca.jpg" },
  { claveColor: claveColorCombo([unColor("Palo de rosa")])!, fotoUrl: "/uploads/combo-colores/palo-de-rosa.jpg" },
];

describe("claveColorCombo", () => {
  it("lleva el color de cada parte en orden fijo", () => {
    expect(claveColorCombo([conPartes("Negro", "Blanca")])).toBe("estructura=blanca|tapizado=negro");
    expect(claveColorCombo([unColor("Palo de Rosa")])).toBe("color=palo de rosa");
  });

  it("tildes, mayúsculas y otro orden de partes dan la misma clave", () => {
    const otraForma = {
      color: "",
      partes: [
        { parte: "ESTRUCTURA ", color: "blanca" },
        { parte: "tapizado", color: " NEGRO" },
      ],
    };
    expect(claveColorCombo([otraForma])).toBe(claveColorCombo([conPartes("Negro", "Blanca")]));
    expect(claveColorCombo([unColor("Café")])).toBe(claveColorCombo([unColor("cafe")]));
  });

  it("una parte en Por definir o vacía no tiene clave", () => {
    expect(claveColorCombo([conPartes("Negro", "Por definir")])).toBeNull();
    expect(claveColorCombo([conPartes("", "Blanca")])).toBeNull();
    expect(claveColorCombo([unColor("")])).toBeNull();
    expect(claveColorCombo([])).toBeNull();
  });

  it("piezas del combo con colores distintos no tienen clave", () => {
    expect(claveColorCombo([conPartes("Negro", "Blanca"), conPartes("Negro", "Negra")])).toBeNull();
    expect(claveColorCombo([conPartes("Negro", "Blanca"), conPartes("Negro", "Blanca")])).toBe(
      "estructura=blanca|tapizado=negro",
    );
  });
});

describe("fotoExactaDelColor", () => {
  it("«todo negro» no encuentra la foto de «negro con estructura blanca»", () => {
    expect(fotoExactaDelColor(fotos, claveColorCombo([conPartes("Negro", "Negra")]))).toBeNull();
  });

  it("palo de rosa encuentra la suya y negro con estructura blanca la suya", () => {
    expect(fotoExactaDelColor(fotos, claveColorCombo([unColor("palo de rosa")]))?.fotoUrl).toBe(
      "/uploads/combo-colores/palo-de-rosa.jpg",
    );
    expect(fotoExactaDelColor(fotos, claveColorCombo([conPartes("Negro", "Blanca")]))?.fotoUrl).toBe(
      "/uploads/combo-colores/negro-blanca.jpg",
    );
  });

  it("un color sin foto o sin clave da null", () => {
    expect(fotoExactaDelColor(fotos, claveColorCombo([unColor("Azul rey")]))).toBeNull();
    expect(fotoExactaDelColor(fotos, null)).toBeNull();
  });

  it("la etiqueta se lee como en la cotización", () => {
    expect(etiquetaColorCombo(conPartes("Negro", "Blanca"))).toBe("Tapizado: Negro · Estructura: Blanca");
    expect(etiquetaColorCombo(unColor(" Palo de rosa "))).toBe("Palo de rosa");
  });
});
