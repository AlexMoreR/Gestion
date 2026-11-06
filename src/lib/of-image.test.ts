import { describe, expect, it } from "vitest";
import { imagenesDeLaLinea, imagenManualDe, notaCambioImagen, notesWithOfImage, validarArchivoImagenOF, OF_IMAGE_MAX_BYTES } from "./of-image";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

describe("notesWithOfImage", () => {
  const antes = stringifyQuoteItemMeta({
    description: "Con base cromada",
    color: "Crema",
    additionalCost: 20000,
    discount: 5000,
    comboKey: "k1",
    comboName: "Combo barbería",
    colorCodigo: "CR-01",
    imagenColoresUrl: "/uploads/vista-color/a.webp",
  });

  it("pone la imagen y deja igual todo lo demás de la nota", () => {
    const despues = parseQuoteItemMeta(notesWithOfImage(antes, "/uploads/of-imagenes/x.webp"));
    expect(despues.imageUrl).toBe("/uploads/of-imagenes/x.webp");
    expect({ ...despues, imageUrl: "" }).toEqual({ ...parseQuoteItemMeta(antes), imageUrl: "" });
  });

  it("vacío borra la imagen manual (vuelve a la del catálogo) sin tocar lo demás", () => {
    const con = notesWithOfImage(antes, "/uploads/of-imagenes/x.webp");
    expect(imagenManualDe(con)).toBe("/uploads/of-imagenes/x.webp");
    const sin = notesWithOfImage(con, "");
    expect(imagenManualDe(sin)).toBe("");
    expect(parseQuoteItemMeta(sin)).toEqual(parseQuoteItemMeta(antes));
  });

  it("con notas vacías o de texto viejo conserva el texto como descripción", () => {
    expect(parseQuoteItemMeta(notesWithOfImage(null, "/u/a.webp")).imageUrl).toBe("/u/a.webp");
    const viejo = parseQuoteItemMeta(notesWithOfImage("Medidas 60x40", "/u/a.webp"));
    expect(viejo.description).toBe("Medidas 60x40");
    expect(viejo.imageUrl).toBe("/u/a.webp");
  });
});

describe("imagenesDeLaLinea (prioridad)", () => {
  it("sin nada manual usa la del catálogo", () => {
    expect(imagenesDeLaLinea({ imagenColoresUrl: "", imageUrl: "" }, "/cat.webp")).toEqual({
      principal: "/cat.webp",
      principalEsColores: false,
      referencia: "",
    });
  });
  it("la subida a mano le gana a la del catálogo", () => {
    expect(imagenesDeLaLinea({ imagenColoresUrl: "", imageUrl: "/manual.webp" }, "/cat.webp").principal).toBe("/manual.webp");
  });
  it("con imagen de colores, esa es la principal y la manual sale como referencia", () => {
    expect(imagenesDeLaLinea({ imagenColoresUrl: "/colores.webp", imageUrl: "/manual.webp" }, "/cat.webp")).toEqual({
      principal: "/colores.webp",
      principalEsColores: true,
      referencia: "/manual.webp",
    });
  });
  it("con imagen de colores y sin manual no hay referencia", () => {
    expect(imagenesDeLaLinea({ imagenColoresUrl: "/colores.webp", imageUrl: "" }, "/cat.webp").referencia).toBe("");
  });
});

describe("validarArchivoImagenOF", () => {
  it("acepta jpg, png y webp", () => {
    for (const [name, type] of [["a.jpg", "image/jpeg"], ["a.png", "image/png"], ["a.webp", "image/webp"], ["pegada", "image/png"]]) {
      expect(validarArchivoImagenOF({ name, type, size: 1000 }).ok).toBe(true);
    }
  });
  it("rechaza vacío, pesado, otro tipo o extensión rara", () => {
    expect(validarArchivoImagenOF({ name: "a.jpg", type: "image/jpeg", size: 0 }).ok).toBe(false);
    expect(validarArchivoImagenOF({ name: "a.jpg", type: "image/jpeg", size: OF_IMAGE_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validarArchivoImagenOF({ name: "a.pdf", type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(validarArchivoImagenOF({ name: "a.exe", type: "image/png", size: 10 }).ok).toBe(false);
  });
});

describe("notaCambioImagen", () => {
  it("dice quién cambió la imagen", () => {
    expect(notaCambioImagen("Silla", "María", false)).toBe("Imagen de Silla cambiada por María");
  });
  it("dice quién la restauró a la del catálogo", () => {
    expect(notaCambioImagen("Silla", "María", true)).toBe("Imagen de Silla restaurada a la del catálogo por María");
  });
});
