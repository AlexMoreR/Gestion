// Fichas tecnicas del producto (ProductImage.tipo = "ficha").
// Funciones puras (sin red, fs ni base). Pruebas en product-fichas.test.ts.
//
// Regla de oro: una ficha NUNCA es una foto. La galeria de la tienda, la portada (thumbnailUrl),
// "Traer de Drive", el organizador de fotos, el formulario de edicion y la API /api/catalogo
// (la que lee NETMAGI para publicar en Marketplace) leen SOLO tipo = "foto".
//
// Usa rutas relativas: tambien lo importa scripts/importar-fichas.ts (vite-node no conoce "@/").

import { isValidDriveFileId } from "./drive-gallery";

export const TIPO_FOTO = "foto";
export const TIPO_FICHA = "ficha";
export type TipoImagen = typeof TIPO_FOTO | typeof TIPO_FICHA;

// Filtro de Prisma para leer SOLO las fotos de la galeria.
export const SOLO_FOTOS = { tipo: TIPO_FOTO } as const;
export const SOLO_FICHAS = { tipo: TIPO_FICHA } as const;

// Una fila sin `tipo` (datos viejos o pruebas) cuenta como foto: es el default de la columna.
export function esFicha(row: { tipo?: string | null }): boolean {
  return row.tipo === TIPO_FICHA;
}

export function soloFotos<T extends { tipo?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !esFicha(row));
}

export function soloFichas<T extends { tipo?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter(esFicha);
}

export function separarImagenes<T extends { tipo?: string | null }>(rows: readonly T[]): { fotos: T[]; fichas: T[] } {
  return { fotos: soloFotos(rows), fichas: soloFichas(rows) };
}

// Siguiente `order` (al final). Se calcula sobre TODAS las filas del producto.
export function siguienteOrden(rows: readonly { order: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.order), -1) + 1;
}

// Enlace o id de Drive -> id. Acepta:
//   1AbC...xyz
//   https://drive.google.com/file/d/<id>/view?usp=sharing
//   https://drive.google.com/open?id=<id>   ·   https://drive.google.com/uc?id=<id>&export=download
//   https://docs.google.com/uc?export=view&id=<id>
// Vacio -> null. Algo que no se entiende -> "invalido".
export function leerDriveFileId(raw: string | null | undefined): string | null | "invalido" {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (isValidDriveFileId(text)) return text;
  const byPath = /\/(?:file\/)?d\/([A-Za-z0-9_-]{10,100})(?:[/?#]|$)/.exec(text);
  if (byPath && isValidDriveFileId(byPath[1])) return byPath[1];
  const byQuery = /[?&]id=([A-Za-z0-9_-]{10,100})(?:[&#]|$)/.exec(text);
  if (byQuery && isValidDriveFileId(byQuery[1])) return byQuery[1];
  return "invalido";
}

export function enlaceDrive(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
}

// Nombre del archivo en uploads/products. Con driveFileId es fijo (volver a cargar la misma ficha
// pisa el mismo archivo, no crea otro). Sin driveFileId lleva un sufijo aleatorio.
export function nombreArchivoFicha(driveFileId: string | null, aleatorio: string): string {
  if (driveFileId) {
    if (!isValidDriveFileId(driveFileId)) throw new Error("ID de Drive invalido");
    return `ficha-${driveFileId}.jpg`;
  }
  const limpio = aleatorio.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  if (!limpio) throw new Error("Nombre de archivo invalido");
  return `ficha-${limpio}.jpg`;
}

// Texto alternativo de la ficha en la tienda.
export function altFicha(nombreProducto: string, indice: number, total: number): string {
  const base = `Ficha técnica de ${nombreProducto.trim() || "el producto"}: medidas y materiales`;
  return total > 1 ? `${base} (${indice + 1} de ${total})` : base;
}

// ── CSV de importacion: codigo,ficha,driveFileId,nota ───────────────────────

export type FilaFicha = {
  linea: number; // linea del CSV (1 = encabezado)
  codigo: string; // en mayusculas
  ficha: string; // nombre de la ficha en Drive (solo informativo)
  driveFileId: string;
  nota: string;
};

export type CsvFichas = { filas: FilaFicha[]; errores: string[] };

const COLUMNAS = ["codigo", "ficha", "drivefileid", "nota"] as const;

// CSV simple (RFC 4180): comas, comillas dobles y "" para una comilla dentro del campo.
export function partirCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  const limpio = texto.replace(/^﻿/, "");
  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

export function leerCsvFichas(texto: string): CsvFichas {
  const errores: string[] = [];
  const filas: FilaFicha[] = [];
  const crudas = partirCsv(texto);
  if (crudas.length === 0) return { filas, errores: ["El CSV esta vacio"] };

  const encabezado = crudas[0].map((h) => h.trim().toLowerCase());
  const indice = Object.fromEntries(COLUMNAS.map((c) => [c, encabezado.indexOf(c)])) as Record<
    (typeof COLUMNAS)[number],
    number
  >;
  if (indice.codigo < 0 || indice.drivefileid < 0) {
    return { filas, errores: ["El CSV debe tener las columnas codigo y driveFileId (y opcionales ficha, nota)"] };
  }

  const vistas = new Set<string>();
  crudas.slice(1).forEach((celdas, i) => {
    const linea = i + 2;
    if (celdas.every((c) => !c.trim())) return; // linea vacia
    const valor = (col: number) => (col >= 0 ? (celdas[col] ?? "").trim() : "");
    const codigo = valor(indice.codigo).toUpperCase();
    const driveFileId = valor(indice.drivefileid);
    if (!codigo) {
      errores.push(`Linea ${linea}: falta el codigo`);
      return;
    }
    if (!isValidDriveFileId(driveFileId)) {
      errores.push(`Linea ${linea} (${codigo}): driveFileId invalido "${driveFileId}"`);
      return;
    }
    const clave = `${codigo}|${driveFileId}`;
    if (vistas.has(clave)) {
      errores.push(`Linea ${linea} (${codigo}): fila repetida, se ignora`);
      return;
    }
    vistas.add(clave);
    filas.push({ linea, codigo, ficha: valor(indice.ficha), driveFileId, nota: valor(indice.nota) });
  });
  return { filas, errores };
}

// ── Plan de importacion ─────────────────────────────────────────────────────

export type ProductoParaFichas = {
  id: string;
  code: string | null;
  // driveFileId de las fichas que ya tiene el producto
  fichasDriveIds: string[];
};

export type AccionFicha =
  | { tipo: "crear"; fila: FilaFicha; productId: string }
  | { tipo: "ya-existe"; fila: FilaFicha; productId: string }
  | { tipo: "sin-producto"; fila: FilaFicha }
  | { tipo: "sin-imagen"; fila: FilaFicha; productId: string };

export type PlanFichas = {
  acciones: AccionFicha[];
  codigosInexistentes: string[];
  resumen: { crear: number; yaExiste: number; sinProducto: number; sinImagen: number };
};

// `imagenesDisponibles` = driveFileId de las imagenes que hay en la carpeta (null = no se revisa).
export function planearImportacionFichas(
  filas: readonly FilaFicha[],
  productos: readonly ProductoParaFichas[],
  imagenesDisponibles: ReadonlySet<string> | null = null,
): PlanFichas {
  const porCodigo = new Map<string, ProductoParaFichas>();
  for (const producto of productos) {
    const code = (producto.code ?? "").trim().toUpperCase();
    if (code && !porCodigo.has(code)) porCodigo.set(code, producto);
  }
  const acciones: AccionFicha[] = [];
  const inexistentes: string[] = [];
  for (const fila of filas) {
    const producto = porCodigo.get(fila.codigo);
    if (!producto) {
      acciones.push({ tipo: "sin-producto", fila });
      if (!inexistentes.includes(fila.codigo)) inexistentes.push(fila.codigo);
      continue;
    }
    if (producto.fichasDriveIds.includes(fila.driveFileId)) {
      acciones.push({ tipo: "ya-existe", fila, productId: producto.id });
      continue;
    }
    if (imagenesDisponibles && !imagenesDisponibles.has(fila.driveFileId)) {
      acciones.push({ tipo: "sin-imagen", fila, productId: producto.id });
      continue;
    }
    acciones.push({ tipo: "crear", fila, productId: producto.id });
  }
  const contar = (t: AccionFicha["tipo"]) => acciones.filter((a) => a.tipo === t).length;
  return {
    acciones,
    codigosInexistentes: inexistentes,
    resumen: {
      crear: contar("crear"),
      yaExiste: contar("ya-existe"),
      sinProducto: contar("sin-producto"),
      sinImagen: contar("sin-imagen"),
    },
  };
}

// Nombre de archivo de la carpeta -> driveFileId ("1AbC....jpg" -> "1AbC..."). Otro -> null.
export function driveIdDeArchivo(nombre: string): string | null {
  const match = /^([A-Za-z0-9_-]{10,100})\.(jpe?g|png|webp)$/i.exec(nombre.trim());
  return match ? match[1] : null;
}
