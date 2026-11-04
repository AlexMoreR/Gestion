// Vista previa de color por parte (nov-2026): pinta cada parte de la foto de portada con su color.
// Por cada parte, la zona blanca de su máscara pasa a gris y se multiplica por el color (o por la foto de
// la muestra en mosaico), así se conservan las sombras; el resto de la foto no cambia.
// Resultado en public/uploads/vista-color/<hash>.webp: si ya existe no se vuelve a hacer.
//
// Sin "server-only" a propósito: también lo usa scripts/vista-color-prueba.ts. Usa fs y sharp.
// shortcut: la carpeta vista-color crece sin límite (una imagen por combinación de colores); limpiarla si pesa.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** Una imagen: bytes, una ruta pública /uploads/... o una URL http(s) (ej. foto de la muestra del CRM). */
export type FuenteImagen = Buffer | string;

export type ParteARecolorear = {
  mascara: FuenteImagen | null | undefined;
  /** Color exacto (#RRGGBB). Si no hay, se usa texturaUrl. */
  hex?: string | null;
  texturaUrl?: FuenteImagen | null;
};

// Cambiar si cambia el cálculo: así no se reusan imágenes viejas.
const VERSION = "v1";
const TEXTURA_LADO = 160; // tamaño de una baldosa del mosaico
const DESCARGA_MAX_BYTES = 15 * 1024 * 1024;

const HEX = /^#?([0-9a-f]{6})$/i;

function carpetaUploads(uploadsRoot?: string): string {
  return uploadsRoot ?? path.join(process.cwd(), "public", "uploads");
}

/** Solo se bajan fotos del CRM (las muestras de la carta): nunca una dirección cualquiera escrita en una nota. */
function hostPermitido(): string {
  try {
    return new URL(process.env.CRM_CARTA_COLORES_URL?.trim() || "https://crm.magilus.com").host;
  } catch {
    return "crm.magilus.com";
  }
}

/** Lee una imagen: Buffer tal cual; /uploads/... del disco (sin salir de la carpeta); https del CRM con tope de tiempo y tamaño. */
export async function leerImagen(fuente: FuenteImagen, uploadsRoot?: string): Promise<Buffer> {
  if (Buffer.isBuffer(fuente)) return fuente;
  const texto = fuente.trim();
  if (/^https?:\/\//i.test(texto)) {
    const destino = new URL(texto);
    if (destino.protocol !== "https:" || destino.host !== hostPermitido()) throw new Error("imagen de un sitio no permitido");
    const res = await fetch(destino, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!res.ok) throw new Error(`no se pudo bajar la imagen (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > DESCARGA_MAX_BYTES) throw new Error("la imagen pesa demasiado");
    return bytes;
  }
  const relativa = texto.split("?")[0];
  if (!relativa.startsWith("/uploads/") || relativa.includes("..")) throw new Error("ruta de imagen no permitida");
  return readFile(path.join(carpetaUploads(uploadsRoot), ...relativa.slice("/uploads/".length).split("/").filter(Boolean)));
}

/** Ancho y alto como se ve la foto (con la rotación EXIF aplicada), igual que en el navegador. */
export async function medidasVisibles(bytes: Buffer): Promise<{ ancho: number; alto: number } | null> {
  const meta = await sharp(bytes).metadata();
  const ancho = meta.autoOrient?.width ?? meta.width;
  const alto = meta.autoOrient?.height ?? meta.height;
  return ancho && alto ? { ancho, alto } : null;
}

type ParteLista = { mascara: Buffer; hex: string | null; textura: Buffer | null };

/**
 * Foto de portada con cada parte pintada de su color. null si no hay partes o si a alguna le falta
 * máscara o color (la pantalla dice "Sin vista previa de color").
 */
export async function recolorear(entrada: {
  fotoBase: FuenteImagen;
  partes: ParteARecolorear[];
  uploadsRoot?: string;
}): Promise<{ url: string; buffer: Buffer } | null> {
  const { partes, uploadsRoot } = entrada;
  if (partes.length === 0) return null;
  if (partes.some((parte) => !parte.mascara || (!HEX.test(parte.hex?.trim() ?? "") && !parte.texturaUrl))) return null;

  const foto = await leerImagen(entrada.fotoBase, uploadsRoot);
  const listas: ParteLista[] = await Promise.all(
    partes.map(async (parte) => {
      const hex = HEX.exec(parte.hex?.trim() ?? "")?.[1]?.toLowerCase() ?? null;
      return {
        mascara: await leerImagen(parte.mascara!, uploadsRoot),
        hex,
        textura: hex ? null : await leerImagen(parte.texturaUrl!, uploadsRoot),
      };
    }),
  );

  const hash = createHash("sha256").update(VERSION).update(foto);
  for (const parte of listas) {
    hash.update("|m").update(parte.mascara);
    if (parte.hex) hash.update(`|h${parte.hex}`);
    else hash.update("|t").update(parte.textura!);
  }
  const nombre = `${hash.digest("hex").slice(0, 40)}.webp`;
  const carpeta = path.join(carpetaUploads(uploadsRoot), "vista-color");
  const destino = path.join(carpeta, nombre);
  const url = `/uploads/vista-color/${nombre}`;

  const yaHecha = await stat(destino).then((s) => s.isFile(), () => false);
  if (yaHecha) return { url, buffer: await readFile(destino) };

  const base = await sharp(foto).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const canales = base.info.channels; // 3 tras removeAlpha
  const salida = Buffer.from(base.data);
  const pixeles = width * height;

  // Luz de cada pixel de la foto original (0..1).
  const luz = new Float32Array(pixeles);
  for (let i = 0; i < pixeles; i++) {
    const o = i * canales;
    luz[i] = (0.299 * base.data[o] + 0.587 * base.data[o + 1] + 0.114 * base.data[o + 2]) / 255;
  }

  for (const parte of listas) {
    const mascara = await sharp(parte.mascara)
      .flatten({ background: "#000000" })
      .resize(width, height, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    // Luz media de la zona: el color elegido queda tal cual en la luz media; sombras y brillos se conservan.
    let suma = 0;
    let peso = 0;
    for (let i = 0; i < pixeles; i++) {
      const a = mascara[i] / 255;
      suma += luz[i] * a;
      peso += a;
    }
    if (peso === 0) continue; // máscara vacía: esa parte no pinta nada
    const media = Math.max(suma / peso, 0.02);

    let color: (i: number) => [number, number, number];
    if (parte.hex) {
      const rgb: [number, number, number] = [0, 2, 4].map((j) => parseInt(parte.hex!.slice(j, j + 2), 16)) as [number, number, number];
      color = () => rgb;
    } else {
      const tex = await sharp(parte.textura!)
        .rotate()
        .removeAlpha()
        .resize(TEXTURA_LADO, TEXTURA_LADO, { fit: "cover" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const tc = tex.info.channels;
      color = (i) => {
        const o = (((Math.floor(i / width) % TEXTURA_LADO) * TEXTURA_LADO) + ((i % width) % TEXTURA_LADO)) * tc;
        return [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
      };
    }

    for (let i = 0; i < pixeles; i++) {
      const a = mascara[i] / 255;
      if (a === 0) continue;
      const factor = luz[i] / media;
      const c = color(i);
      const o = i * canales;
      for (let j = 0; j < 3; j++) {
        const pintado = Math.min(255, c[j] * factor);
        salida[o + j] = Math.round(salida[o + j] * (1 - a) + pintado * a);
      }
    }
  }

  const buffer = await sharp(salida, { raw: { width, height, channels: canales } }).webp({ quality: 86 }).toBuffer();
  await mkdir(carpeta, { recursive: true });
  const temporal = `${destino}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, buffer);
    await rename(temporal, destino);
  } catch (error) {
    await unlink(temporal).catch(() => undefined);
    throw error;
  }
  return { url, buffer };
}
