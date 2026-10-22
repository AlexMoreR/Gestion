import { describe, expect, it } from "vitest";
import {
  findCoverId,
  formatBytes,
  imageSource,
  moveItem,
  moveToFront,
  planGallerySave,
  removeId,
  type OrganizerRow,
} from "./gallery-organizer";

const row = (id: string, order: number, extra: Partial<OrganizerRow> = {}): OrganizerRow => ({
  id,
  url: `/uploads/products/${id}.jpg`,
  order,
  origen: null,
  driveFileId: null,
  ...extra,
});
const rows = [row("a", 0), row("b", 1, { origen: "drive", driveFileId: "driveFile0001" }), row("c", 2)];

describe("moveItem / moveToFront / removeId", () => {
  it("mueve hacia abajo y hacia arriba", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });
  it("fuera de rango no cambia nada", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
  it("moveToFront y removeId", () => {
    expect(moveToFront(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(moveToFront(["a", "b"], "x")).toEqual(["a", "b"]);
    expect(removeId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("imageSource / findCoverId / formatBytes", () => {
  it("etiqueta Drive, Servidor o Enlace", () => {
    expect(imageSource(rows[1])).toBe("drive");
    expect(imageSource(row("x", 0, { driveFileId: "driveFile0002" }))).toBe("drive");
    expect(imageSource(rows[0])).toBe("servidor");
    expect(imageSource(row("x", 0, { url: "https://magilus.com/uploads/products/x.jpg" }))).toBe("servidor");
    expect(imageSource(row("x", 0, { url: "https://otro.com/foto.jpg" }))).toBe("enlace");
  });
  it("encuentra la portada aunque una URL sea absoluta y la otra relativa", () => {
    expect(findCoverId(rows, "https://magilus.com/uploads/products/b.jpg")).toBe("b");
    expect(findCoverId(rows, "/file.svg")).toBeNull();
    expect(findCoverId(rows, "")).toBeNull();
  });
  it("formatea tamanos", () => {
    expect(formatBytes(350 * 1024)).toBe("350 KB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("planGallerySave", () => {
  const base = { rows, removeIds: [] as string[], currentThumbnailUrl: "/uploads/products/a.jpg" };

  it("reordenar: solo actualiza las filas que cambian de lugar y mantiene la portada primera", () => {
    const plan = planGallerySave({ ...base, order: ["a", "c", "b"], coverId: "a" });
    expect(plan).toMatchObject({ ok: true, finalIds: ["a", "c", "b"], remove: [], thumbnailUrl: "/uploads/products/a.jpg" });
    if (plan.ok) expect(plan.update).toEqual([{ id: "c", order: 1 }, { id: "b", order: 2 }]);
  });

  it("portada: la elegida pasa a primera y cambia thumbnailUrl", () => {
    const plan = planGallerySave({ ...base, order: ["a", "b", "c"], coverId: "b" });
    expect(plan).toMatchObject({ ok: true, finalIds: ["b", "a", "c"], thumbnailUrl: "/uploads/products/b.jpg" });
  });

  it("quitar: borra la fila y si era la portada, la reemplaza la primera que queda", () => {
    const plan = planGallerySave({ ...base, order: ["c", "b"], removeIds: ["a"], coverId: null });
    expect(plan).toMatchObject({ ok: true, remove: ["a"], finalIds: ["c", "b"], thumbnailUrl: "/uploads/products/c.jpg" });
  });

  it("no deja el producto sin fotos", () => {
    const plan = planGallerySave({ ...base, order: [], removeIds: ["a", "b", "c"], coverId: null });
    expect(plan).toEqual({ ok: false, error: "El producto debe quedar con al menos una foto" });
  });

  it("filas nuevas que la pagina no conocia no se borran: quedan al final", () => {
    const withNew = [...rows, row("d", 3, { origen: "drive", driveFileId: "driveFile0003" })];
    const plan = planGallerySave({ ...base, rows: withNew, order: ["c", "a", "b"], coverId: "c" });
    expect(plan).toMatchObject({ ok: true, finalIds: ["c", "a", "b", "d"], remove: [] });
  });

  it("ignora ids ajenos o repetidos", () => {
    const plan = planGallerySave({ ...base, order: ["zz", "a", "a", "b", "c"], removeIds: ["yy"], coverId: "zz" });
    expect(plan).toMatchObject({ ok: true, finalIds: ["a", "b", "c"], remove: [], thumbnailUrl: "/uploads/products/a.jpg" });
  });

  it("si la portada no esta en la galeria y no se elige otra, no toca thumbnailUrl", () => {
    const plan = planGallerySave({ ...base, currentThumbnailUrl: "/file.svg", order: ["b", "a", "c"], coverId: null });
    expect(plan).toMatchObject({ ok: true, finalIds: ["b", "a", "c"], thumbnailUrl: "/file.svg" });
  });
});
