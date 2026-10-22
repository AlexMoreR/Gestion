// Fase 6: galeria del producto conectada a Drive (por medio de NETMAGI).
// Funciones puras (sin red, fs ni base) para elegir que fotos traer y para conservar las
// ProductImage al editar. Pruebas en drive-gallery.test.ts.

export const DRIVE_GALLERY_MAX = 8; // fotos en total en la galeria (portada incluida)
export const DRIVE_MIN_SIDE = 800; // lado mayor minimo de una foto de Drive
export const DRIVE_MAX_PER_COLOR = 2; // fotos por carpeta de color
export const DRIVE_OUTPUT_MAX_SIDE = 2000; // la copia en el servidor se reduce a este lado mayor
export const DRIVE_OUTPUT_JPEG_QUALITY = 85;

const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

export type NetmagiFoto = {
  drive_id: string;
  nombre?: string | null;
  ancho?: number | null;
  alto?: number | null;
  orden?: number | null;
  carpeta?: { drive_id?: string | null; tipo?: string | null; color?: string | null; ruta?: string | null } | null;
};

export function isValidDriveFileId(id: string): boolean {
  return DRIVE_ID.test(id);
}

// Nombre fijo del archivo en uploads/products: asi volver a traer la misma foto no crea otra.
export function driveUploadFileName(driveFileId: string): string {
  if (!isValidDriveFileId(driveFileId)) {
    throw new Error("ID de Drive invalido");
  }
  return `drive-${driveFileId}.jpg`;
}

// Clave para comparar URLs de imagenes: el formulario del admin puede devolver la ruta absoluta
// (https://magilus.com/uploads/...) y la base tener la relativa (/uploads/...), o al reves.
export function imageUrlKey(url: string): string {
  const raw = url.trim();
  const match = /^https?:\/\/[^/]+(\/.*)$/i.exec(raw);
  const pathPart = match ? match[1] : raw;
  // Solo las rutas locales se comparan sin dominio; un enlace externo se compara completo.
  if (match && !/^\/uploads\//.test(pathPart)) return raw;
  return pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
}

// Fotos que hoy muestra la ficha: la portada y las imagenes, sin repetir.
export function galleryCount(thumbnailUrl: string | null | undefined, imageUrls: string[]): number {
  const keys = new Set<string>();
  if (thumbnailUrl && thumbnailUrl.trim()) keys.add(imageUrlKey(thumbnailUrl));
  for (const url of imageUrls) if (url.trim()) keys.add(imageUrlKey(url));
  return keys.size;
}

function longSide(foto: NetmagiFoto): number | null {
  const w = Number(foto.ancho);
  const h = Number(foto.alto);
  const hasW = Number.isFinite(w) && w > 0;
  const hasH = Number.isFinite(h) && h > 0;
  if (!hasW && !hasH) return null;
  return Math.max(hasW ? w : 0, hasH ? h : 0);
}

export type DriveSelection = {
  selected: NetmagiFoto[];
  alreadyInProduct: number;
  tooSmall: number;
  slots: number;
};

// Elige que fotos de NETMAGI traer.
//  · Respeta el orden que manda NETMAGI (modelo primero, luego colores; dentro, IA > resolucion).
//  · Descarta las que ya estan en el producto (mismo driveFileId) y las de lado < 800 px. Si
//    NETMAGI no sabe las medidas, la foto entra y se revisa al descargarla.
//  · Cupo = 8 - fotos que ya tiene la galeria. Si hay colores, se guarda 1 lugar por color (hasta la
//    mitad del cupo) para que no se lo coma el modelo; luego se llena con 1-2 por color y, si sobra,
//    con mas fotos del modelo.
//  · Resultado: primero las del modelo, al final las de color (agrupadas por color).
export function selectDrivePhotos(input: {
  fotos: NetmagiFoto[];
  existingDriveFileIds: Iterable<string>;
  currentCount: number;
  max?: number;
}): DriveSelection {
  const max = input.max ?? DRIVE_GALLERY_MAX;
  const existing = new Set(input.existingDriveFileIds);
  const slots = Math.max(0, max - Math.max(0, input.currentCount));
  let alreadyInProduct = 0;
  let tooSmall = 0;

  const seen = new Set<string>();
  const modelo: NetmagiFoto[] = [];
  const colorGroups = new Map<string, NetmagiFoto[]>();

  for (const foto of input.fotos) {
    const id = String(foto.drive_id ?? "");
    if (!isValidDriveFileId(id) || seen.has(id)) continue;
    seen.add(id);
    if (existing.has(id)) {
      alreadyInProduct += 1;
      continue;
    }
    const side = longSide(foto);
    if (side !== null && side < DRIVE_MIN_SIDE) {
      tooSmall += 1;
      continue;
    }
    const isColor = foto.carpeta?.tipo === "color";
    if (!isColor) {
      modelo.push(foto);
      continue;
    }
    const key = (foto.carpeta?.color || foto.carpeta?.drive_id || "color").toString().trim().toUpperCase();
    const group = colorGroups.get(key) ?? [];
    group.push(foto);
    colorGroups.set(key, group);
  }

  const groups = [...colorGroups.values()];
  const reserve = Math.min(groups.length, Math.floor(slots / 2));
  const modeloPicks = modelo.slice(0, Math.max(0, slots - reserve));
  let remaining = slots - modeloPicks.length;

  const colorPicks = groups.map(() => [] as NetmagiFoto[]);
  for (let round = 0; round < DRIVE_MAX_PER_COLOR && remaining > 0; round += 1) {
    groups.forEach((group, index) => {
      if (remaining > 0 && group[round]) {
        colorPicks[index].push(group[round]);
        remaining -= 1;
      }
    });
  }
  // Si sobra cupo (pocos colores), mas fotos del modelo.
  const extraModelo = modelo.slice(modeloPicks.length, modeloPicks.length + Math.max(0, remaining));

  return {
    selected: [...modeloPicks, ...extraModelo, ...colorPicks.flat()],
    alreadyInProduct,
    tooSmall,
    slots,
  };
}

// ── Editar un producto sin perder driveFileId / origen ──────────────────────
export type ExistingImageRow = { id: string; url: string; order: number };
export type ImageSyncPlan = {
  update: { id: string; order: number }[];
  create: { url: string; order: number; origen: string | null }[];
  remove: string[];
};

// nextUrls = la galeria que manda el formulario, en orden. uploadedUrls = las que se acaban de
// subir en el admin (se marcan origen "servidor"). Las filas que siguen se conservan (con su
// driveFileId y origen) y solo cambian de orden; se crean las nuevas y se borran las quitadas.
export function planImageSync(
  existing: ExistingImageRow[],
  nextUrls: string[],
  uploadedUrls: Iterable<string> = [],
): ImageSyncPlan {
  const uploaded = new Set([...uploadedUrls].map(imageUrlKey));
  const pool = new Map<string, ExistingImageRow[]>();
  for (const row of [...existing].sort((a, b) => a.order - b.order)) {
    const key = imageUrlKey(row.url);
    const list = pool.get(key) ?? [];
    list.push(row);
    pool.set(key, list);
  }

  const plan: ImageSyncPlan = { update: [], create: [], remove: [] };
  nextUrls.forEach((url, order) => {
    const key = imageUrlKey(url);
    const match = uploaded.has(key) ? undefined : pool.get(key)?.shift();
    if (match) {
      if (match.order !== order) plan.update.push({ id: match.id, order });
    } else {
      plan.create.push({ url, order, origen: uploaded.has(key) ? "servidor" : null });
    }
  });
  for (const rows of pool.values()) for (const row of rows) plan.remove.push(row.id);
  return plan;
}

// Lista de codigos escrita a mano ("LCV003, sev001\nPSV003") -> ["LCV003","SEV001","PSV003"].
export function parseProductCodes(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const code = part.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
