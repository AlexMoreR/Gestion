// Organizador de fotos del producto (Editar producto -> "Fotos").
// Funciones puras (sin red, fs ni base): reordenar, elegir portada, quitar y armar el plan de
// guardado. Pruebas en gallery-organizer.test.ts.
//
// Reglas:
//  · La portada es Product.thumbnailUrl y siempre queda de PRIMERA en la galeria.
//  · Se trabaja con ids de ProductImage: las filas se conservan (driveFileId / origen intactos),
//    solo cambia `order`. Quitar = borrar la fila; el archivo del disco NO se borra.
//  · No hay limite de fotos aqui (el limite de 8 es solo para "Traer de Drive").

import { imageUrlKey } from "./drive-gallery";

export type OrganizerRow = {
  id: string;
  url: string;
  order: number;
  origen: string | null;
  driveFileId: string | null;
};

export type OrganizerSource = "drive" | "servidor" | "enlace";

// De donde viene la foto. Las filas viejas (origen NULL) con ruta local se cuentan como servidor.
export function imageSource(row: Pick<OrganizerRow, "url" | "origen" | "driveFileId">): OrganizerSource {
  if (row.origen === "drive" || (row.driveFileId && row.driveFileId.trim())) return "drive";
  if (row.origen === "servidor") return "servidor";
  return /^https?:\/\//i.test(row.url.trim()) && !imageUrlKey(row.url).startsWith("/uploads/") ? "enlace" : "servidor";
}

export const SOURCE_LABEL: Record<OrganizerSource, string> = {
  drive: "Drive",
  servidor: "Servidor",
  enlace: "Enlace",
};

// Mueve el elemento de `from` a `to` (drag & drop o botones subir/bajar). Fuera de rango = sin cambio.
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Deja `id` de primera (la portada siempre va primero).
export function moveToFront(ids: readonly string[], id: string): string[] {
  const index = ids.indexOf(id);
  return index <= 0 ? [...ids] : moveItem(ids, index, 0);
}

export function removeId(ids: readonly string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

// Id de la fila que hoy es portada (misma URL que thumbnailUrl), o null si la portada no esta en
// la galeria (pasa con productos viejos o importados por CSV).
export function findCoverId(rows: readonly Pick<OrganizerRow, "id" | "url">[], thumbnailUrl: string | null | undefined): string | null {
  if (!thumbnailUrl || !thumbnailUrl.trim()) return null;
  const key = imageUrlKey(thumbnailUrl);
  return rows.find((row) => imageUrlKey(row.url) === key)?.id ?? null;
}

export type GallerySaveInput = {
  rows: readonly OrganizerRow[]; // filas actuales en la base (pueden haber cambiado desde que se abrio la pagina)
  order: readonly string[]; // ids en el orden que dejo la persona (sin las quitadas)
  removeIds: readonly string[]; // ids que la persona quito
  coverId: string | null; // portada elegida; null = no cambiar thumbnailUrl
  currentThumbnailUrl: string;
};

export type GallerySavePlan =
  | {
      ok: true;
      update: { id: string; order: number }[];
      remove: string[];
      thumbnailUrl: string; // igual a currentThumbnailUrl si no cambia
      finalIds: string[];
    }
  | { ok: false; error: string };

// Arma lo que hay que escribir. Seguro ante cambios en paralelo:
//  · ids que ya no existen se ignoran;
//  · filas nuevas que la pagina no conocia (p. ej. "Traer de Drive" en otra pestana) NO se borran:
//    quedan al final en su orden actual.
//  · si la portada se quito (o no existe), la portada pasa a la primera foto que quede.
export function planGallerySave(input: GallerySaveInput): GallerySavePlan {
  const byId = new Map(input.rows.map((row) => [row.id, row]));
  const remove = [...new Set(input.removeIds)].filter((id) => byId.has(id));
  const removed = new Set(remove);

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of input.order) {
    if (!byId.has(id) || removed.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  const unknown = [...input.rows]
    .sort((a, b) => a.order - b.order)
    .filter((row) => !seen.has(row.id) && !removed.has(row.id))
    .map((row) => row.id);
  let finalIds = [...ordered, ...unknown];

  if (finalIds.length === 0) {
    return { ok: false, error: "El producto debe quedar con al menos una foto" };
  }

  let thumbnailUrl = input.currentThumbnailUrl;
  const currentCoverId = findCoverId(input.rows, input.currentThumbnailUrl);
  let coverId = input.coverId && finalIds.includes(input.coverId) ? input.coverId : null;
  if (!coverId && currentCoverId && removed.has(currentCoverId)) {
    // Se quito la portada: la reemplaza la primera que queda.
    coverId = finalIds[0];
  }
  if (!coverId && currentCoverId && finalIds.includes(currentCoverId)) {
    coverId = currentCoverId;
  }
  if (coverId) {
    finalIds = moveToFront(finalIds, coverId);
    thumbnailUrl = byId.get(coverId)!.url;
  }

  const update: { id: string; order: number }[] = [];
  finalIds.forEach((id, order) => {
    if (byId.get(id)!.order !== order) update.push({ id, order });
  });

  return { ok: true, update, remove, thumbnailUrl, finalIds };
}

// "1,2 MB" / "350 KB". null = tamano desconocido.
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
