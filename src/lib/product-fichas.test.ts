import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { armarProductoDelCatalogo, type ProductoFuente } from "../modules/catalogo-externo/domain/producto-del-catalogo";
import {
  altFicha,
  driveIdDeArchivo,
  enlaceDrive,
  esFicha,
  leerCsvFichas,
  leerDriveFileId,
  nombreArchivoFicha,
  partirCsv,
  planearImportacionFichas,
  separarImagenes,
  siguienteOrden,
  SOLO_FOTOS,
  soloFichas,
  soloFotos,
} from "./product-fichas";

const ID_A = "1kne5Sw6t_1pIiGdhKmhVxIQC8uQGiUyr";
const ID_B = "1E0UPS0sRz6mKj_63jPIq6TNZDta6hFhS";
const ID_C = "1Z5DBrFWG_8Hpsqvt3-j6KM89vqHD9oCr";

const IMAGENES = [
  { id: "f1", url: "/uploads/products/a.jpg", order: 0, tipo: "foto" },
  { id: "x1", url: "/uploads/products/ficha-1.jpg", order: 1, tipo: "ficha" },
  { id: "f2", url: "/uploads/products/b.jpg", order: 2, tipo: "foto" },
  { id: "f3", url: "/uploads/products/c.jpg", order: 3 }, // sin tipo = foto (default de la columna)
  { id: "x2", url: "/uploads/products/ficha-2.jpg", order: 4, tipo: "ficha" },
];

describe("fotos y fichas", () => {
  it("la galeria solo trae fotos (y las filas sin tipo cuentan como foto)", () => {
    expect(soloFotos(IMAGENES).map((i) => i.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("las fichas salen aparte, en orden", () => {
    expect(soloFichas(IMAGENES).map((i) => i.id)).toEqual(["x1", "x2"]);
    const { fotos, fichas } = separarImagenes(IMAGENES);
    expect(fotos.some(esFicha)).toBe(false);
    expect(fichas.every(esFicha)).toBe(true);
    expect(fotos.length + fichas.length).toBe(IMAGENES.length);
  });

  it("el filtro de Prisma es tipo = foto", () => {
    expect(SOLO_FOTOS).toEqual({ tipo: "foto" });
  });

  it("siguienteOrden va al final de todo el producto", () => {
    expect(siguienteOrden(IMAGENES)).toBe(5);
    expect(siguienteOrden([])).toBe(0);
  });

  it("alt descriptivo", () => {
    expect(altFicha("Camilla CAV001", 0, 1)).toBe("Ficha técnica de Camilla CAV001: medidas y materiales");
    expect(altFicha("Silla", 1, 2)).toContain("(2 de 2)");
  });
});

describe("API de catalogo (NETMAGI / CRM)", () => {
  const fuente: ProductoFuente = {
    id: "p1",
    code: "CAV001",
    slug: "camilla-cav001",
    name: "Camilla",
    description: null,
    price: "100",
    regularPrice: null,
    promoPrice: null,
    promoStartsAt: null,
    promoEndsAt: null,
    wholesalePrice: "90",
    minWholesaleQty: 3,
    isBundle: false,
    hiddenFromStore: false,
    thumbnailUrl: "/uploads/products/a.jpg",
    updatedAt: new Date("2026-10-26T10:00:00Z"),
    category: { name: "Camillas", slug: "camillas" },
    images: IMAGENES,
  };

  it("nunca publica una ficha como foto", () => {
    const producto = armarProductoDelCatalogo(fuente, new Date("2026-10-26T12:00:00Z"));
    const todas = JSON.stringify(producto);
    expect(todas).not.toContain("ficha-1.jpg");
    expect(todas).not.toContain("ficha-2.jpg");
    expect(producto.imagenes).toEqual([
      "https://magilus.com/uploads/products/a.jpg",
      "https://magilus.com/uploads/products/b.jpg",
      "https://magilus.com/uploads/products/c.jpg",
    ]);
  });
});

// Guardia contra regresiones: los lugares que leen ProductImage para la galeria, la portada,
// "Traer de Drive" y la API de catalogo deben filtrar tipo = "foto".
describe("lugares filtrados por tipo = foto", () => {
  const raiz = join(__dirname, "..");
  const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

  it.each([
    ["modules/catalogo-externo/application/listar-catalogo.ts", /images: \{ where: SOLO_FOTOS/],
    ["lib/drive-gallery.server.ts", /images: \{ where: SOLO_FOTOS/],
    ["app/actions/product-gallery-actions.ts", /images: \{ where: SOLO_FOTOS/],
    ["app/actions/product-actions.ts", /productId: parsed\.data\.productId, \.\.\.SOLO_FOTOS/],
    ["lib/admin-product-workspace.ts", /where: SOLO_FOTOS/],
    ["app/(storefront)/[slug]/[productSlug]/page.tsx", /separarImagenes\(product\.images\)/],
    ["app/(workspace)/admin/productos/[productId]/page.tsx", /separarImagenes\(product\.images\)/],
    ["components/store/product-detail-content.tsx", /soloFotos\(product\.images\)/],
  ])("%s", (ruta, patron) => {
    expect(leer(ruta)).toMatch(patron);
  });
});

describe("leerDriveFileId", () => {
  it("acepta id o enlaces de Drive", () => {
    expect(leerDriveFileId(ID_A)).toBe(ID_A);
    expect(leerDriveFileId(`https://drive.google.com/file/d/${ID_A}/view?usp=sharing`)).toBe(ID_A);
    expect(leerDriveFileId(`https://drive.google.com/open?id=${ID_A}`)).toBe(ID_A);
    expect(leerDriveFileId(`https://drive.google.com/uc?id=${ID_A}&export=download`)).toBe(ID_A);
    expect(leerDriveFileId(`https://docs.google.com/uc?export=view&id=${ID_A}`)).toBe(ID_A);
  });
  it("vacio = null; basura = invalido", () => {
    expect(leerDriveFileId("")).toBeNull();
    expect(leerDriveFileId("  ")).toBeNull();
    expect(leerDriveFileId("hola mundo")).toBe("invalido");
    expect(leerDriveFileId("../../etc/passwd")).toBe("invalido");
  });
  it("enlace de vuelta", () => {
    expect(enlaceDrive(ID_A)).toBe(`https://drive.google.com/file/d/${ID_A}/view`);
  });
});

describe("nombres de archivo", () => {
  it("con driveFileId es fijo; sin el es aleatorio", () => {
    expect(nombreArchivoFicha(ID_A, "x")).toBe(`ficha-${ID_A}.jpg`);
    expect(nombreArchivoFicha(null, "abc-123")).toBe("ficha-abc-123.jpg");
    expect(() => nombreArchivoFicha("../x", "y")).toThrow();
  });
  it("driveIdDeArchivo", () => {
    expect(driveIdDeArchivo(`${ID_A}.jpg`)).toBe(ID_A);
    expect(driveIdDeArchivo(`${ID_A}.JPEG`)).toBe(ID_A);
    expect(driveIdDeArchivo("desktop.ini")).toBeNull();
    expect(driveIdDeArchivo(`${ID_A}.pdf`)).toBeNull();
  });
});

describe("CSV de fichas", () => {
  const CSV = [
    "\uFEFFcodigo,ficha,driveFileId,nota",
    `CAV001,FCAV01,${ID_A},`,
    `snv004,SNP04 (base platón),${ID_B},dos versiones de base`,
    `SNV004,"SNE04, base araña",${ID_C},"nota con ""comillas"""`,
    `SNV004,repetida,${ID_C},`,
    `,sin codigo,${ID_A},`,
    "LCV003,mala,corto,",
    "",
  ].join("\r\n");

  it("parte comillas y comas", () => {
    expect(partirCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([
      ["a", "b,c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("lee filas validas y reporta errores", () => {
    const { filas, errores } = leerCsvFichas(CSV);
    expect(filas.map((f) => [f.codigo, f.driveFileId])).toEqual([
      ["CAV001", ID_A],
      ["SNV004", ID_B],
      ["SNV004", ID_C],
    ]);
    expect(filas[2].ficha).toBe("SNE04, base araña");
    expect(filas[2].nota).toBe('nota con "comillas"');
    expect(errores).toHaveLength(3); // repetida, sin codigo, id invalido
  });

  it("exige las columnas", () => {
    expect(leerCsvFichas("a,b\n1,2").errores[0]).toMatch(/codigo y driveFileId/);
    expect(leerCsvFichas("").errores).toEqual(["El CSV esta vacio"]);
  });

  it("lee el CSV real si esta en el equipo (41 filas, 40 productos)", () => {
    const real = "D:/Magilus/CRM-Gestion/fichas-seguras-2026-10-26.csv";
    let texto: string;
    try {
      texto = readFileSync(real, "utf8");
    } catch {
      return; // en otro equipo / CI no esta
    }
    const { filas, errores } = leerCsvFichas(texto);
    expect(errores).toEqual([]);
    expect(filas).toHaveLength(41);
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(40);
    expect(filas.filter((f) => f.codigo === "SNV004")).toHaveLength(2);
  });
});

describe("plan de importacion", () => {
  const { filas } = leerCsvFichas(
    ["codigo,ficha,driveFileId,nota", `CAV001,F,${ID_A},`, `SNV004,A,${ID_B},`, `SNV004,B,${ID_C},`, `ZZZ999,X,${ID_A},`].join("\n"),
  );

  it("crea lo nuevo, salta lo que ya esta y reporta codigos que no existen", () => {
    const plan = planearImportacionFichas(filas, [
      { id: "p1", code: "CAV001", fichasDriveIds: [ID_A] },
      { id: "p2", code: "snv004", fichasDriveIds: [] },
    ]);
    expect(plan.acciones.map((a) => a.tipo)).toEqual(["ya-existe", "crear", "crear", "sin-producto"]);
    expect(plan.codigosInexistentes).toEqual(["ZZZ999"]);
    expect(plan.resumen).toEqual({ crear: 2, yaExiste: 1, sinProducto: 1, sinImagen: 0 });
  });

  it("marca las que no tienen imagen en la carpeta", () => {
    const plan = planearImportacionFichas(
      filas,
      [
        { id: "p1", code: "CAV001", fichasDriveIds: [] },
        { id: "p2", code: "SNV004", fichasDriveIds: [] },
      ],
      new Set([ID_A, ID_B]),
    );
    expect(plan.acciones.map((a) => a.tipo)).toEqual(["crear", "crear", "sin-imagen", "sin-producto"]);
  });

  it("es idempotente: con todo cargado no crea nada", () => {
    const plan = planearImportacionFichas(filas, [
      { id: "p1", code: "CAV001", fichasDriveIds: [ID_A] },
      { id: "p2", code: "SNV004", fichasDriveIds: [ID_B, ID_C] },
    ]);
    expect(plan.resumen.crear).toBe(0);
  });
});
