import { describe, expect, it } from "vitest";
import {
  driveUploadFileName,
  galleryCount,
  imageUrlKey,
  parseProductCodes,
  planImageSync,
  selectDrivePhotos,
  type NetmagiFoto,
} from "./drive-gallery";

const id = (n: string) => `drive${n.padStart(8, "0")}`;
const modelo = (n: string, ancho = 1600, alto = 1200): NetmagiFoto => ({
  drive_id: id(n),
  nombre: `${n}.jpg`,
  ancho,
  alto,
  carpeta: { tipo: "modelo", color: "" },
});
const color = (n: string, nombreColor: string, ancho = 1600): NetmagiFoto => ({
  drive_id: id(n),
  nombre: `${n}.jpg`,
  ancho,
  alto: 1000,
  carpeta: { tipo: "color", color: nombreColor },
});
const ids = (fotos: NetmagiFoto[]) => fotos.map((foto) => foto.drive_id);

describe("selectDrivePhotos", () => {
  it("modelo primero y 1-2 por color al final, sin pasar de 8 en total", () => {
    const fotos = [
      ...["1", "2", "3", "4", "5", "6", "7", "8"].map((n) => modelo(n)),
      color("n1", "NEGRO"),
      color("n2", "NEGRO"),
      color("n3", "NEGRO"),
      color("b1", "BLANCO"),
    ];
    const r = selectDrivePhotos({ fotos, existingDriveFileIds: [], currentCount: 1 });
    expect(r.slots).toBe(7);
    expect(r.selected).toHaveLength(7);
    // 7 lugares, 2 colores -> se reservan 2; modelo 5; luego 1 por color.
    expect(ids(r.selected)).toEqual([id("1"), id("2"), id("3"), id("4"), id("5"), id("n1"), id("b1")]);
  });

  it("con pocas fotos del modelo, cada color llega a 2 y nunca mas", () => {
    const fotos = [modelo("1"), color("n1", "NEGRO"), color("n2", "NEGRO"), color("n3", "NEGRO"), color("b1", "BLANCO")];
    const r = selectDrivePhotos({ fotos, existingDriveFileIds: [], currentCount: 1 });
    expect(ids(r.selected)).toEqual([id("1"), id("n1"), id("n2"), id("b1")]);
  });

  it("si sobra cupo vuelve al modelo, pero el modelo va siempre antes que los colores", () => {
    const fotos = [...["1", "2", "3", "4", "5"].map((n) => modelo(n)), color("n1", "NEGRO")];
    const r = selectDrivePhotos({ fotos, existingDriveFileIds: [], currentCount: 0 });
    expect(ids(r.selected)).toEqual([id("1"), id("2"), id("3"), id("4"), id("5"), id("n1")]);
  });

  it("no duplica: salta las que ya tiene el producto (mismo driveFileId)", () => {
    const fotos = [modelo("1"), modelo("2"), modelo("3")];
    const r = selectDrivePhotos({ fotos: [...fotos, modelo("1")], existingDriveFileIds: [id("1")], currentCount: 2 });
    expect(r.alreadyInProduct).toBe(1);
    expect(ids(r.selected)).toEqual([id("2"), id("3")]);
  });

  it("descarta lado < 800 px; sin medidas entra (se revisa al descargar)", () => {
    const sinMedidas: NetmagiFoto = { drive_id: id("x"), carpeta: { tipo: "modelo" } };
    const r = selectDrivePhotos({ fotos: [modelo("1", 799, 600), modelo("2", 600, 800), sinMedidas], existingDriveFileIds: [], currentCount: 0 });
    expect(r.tooSmall).toBe(1);
    expect(ids(r.selected)).toEqual([id("2"), id("x")]);
  });

  it("galeria llena: no trae nada", () => {
    const r = selectDrivePhotos({ fotos: [modelo("1")], existingDriveFileIds: [], currentCount: 8 });
    expect(r.slots).toBe(0);
    expect(r.selected).toEqual([]);
  });

  it("ignora IDs invalidos", () => {
    const r = selectDrivePhotos({ fotos: [{ drive_id: "../../etc" }, modelo("1")], existingDriveFileIds: [], currentCount: 0 });
    expect(ids(r.selected)).toEqual([id("1")]);
  });
});

describe("galleryCount e imageUrlKey", () => {
  it("cuenta portada + imagenes sin repetir, con o sin dominio", () => {
    expect(imageUrlKey("https://magilus.com/uploads/products/a.jpg")).toBe("/uploads/products/a.jpg");
    expect(imageUrlKey("/uploads/products/a.jpg")).toBe("/uploads/products/a.jpg");
    expect(imageUrlKey("https://cdn.x.com/a.jpg")).toBe("https://cdn.x.com/a.jpg");
    expect(galleryCount("https://magilus.com/uploads/products/a.jpg", ["/uploads/products/a.jpg", "/uploads/products/b.jpg"])).toBe(2);
    expect(galleryCount("", [])).toBe(0);
  });
});

describe("driveUploadFileName", () => {
  it("nombre fijo por driveId y rechaza IDs raros", () => {
    expect(driveUploadFileName("1AbC_def-123")).toBe("drive-1AbC_def-123.jpg");
    expect(() => driveUploadFileName("../x")).toThrow();
  });
});

describe("planImageSync (editar sin perder driveFileId)", () => {
  const existing = [
    { id: "a", url: "/uploads/products/a.jpg", order: 0 },
    { id: "d", url: "/uploads/products/drive-XYZ1234567.jpg", order: 1 },
    { id: "c", url: "/uploads/products/c.jpg", order: 2 },
  ];

  it("conserva las filas que siguen, reordena, crea las nuevas y borra las quitadas", () => {
    const plan = planImageSync(
      existing,
      ["https://magilus.com/uploads/products/drive-XYZ1234567.jpg", "https://magilus.com/uploads/products/a.jpg", "/uploads/products/new.jpg"],
      ["/uploads/products/new.jpg"],
    );
    expect(plan.update).toEqual([
      { id: "d", order: 0 },
      { id: "a", order: 1 },
    ]);
    expect(plan.create).toEqual([{ url: "/uploads/products/new.jpg", order: 2, origen: "servidor" }]);
    expect(plan.remove).toEqual(["c"]);
  });

  it("sin cambios no toca nada", () => {
    const plan = planImageSync(existing, existing.map((row) => row.url));
    expect(plan).toEqual({ update: [], create: [], remove: [] });
  });

  it("URL repetida: una fila por aparicion", () => {
    const plan = planImageSync([{ id: "a", url: "/u/a.jpg", order: 0 }], ["/u/a.jpg", "/u/a.jpg"]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([{ url: "/u/a.jpg", order: 1, origen: null }]);
    expect(plan.remove).toEqual([]);
  });
});

describe("parseProductCodes", () => {
  it("separa por coma, espacio o salto, en mayusculas y sin repetir", () => {
    expect(parseProductCodes("lcv003, SEV001\nPSV003;lcv003  ")).toEqual(["LCV003", "SEV001", "PSV003"]);
  });
});
