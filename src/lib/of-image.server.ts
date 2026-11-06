import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { OF_IMAGE_MAX_SIDE, validarArchivoImagenOF } from "./of-image";

// Guarda la imagen de un producto de la OF en public/uploads/of-imagenes/<uuid>.webp (misma carpeta pública
// /uploads que usan las demás fotos): respeta la orientación EXIF, reduce a 1600 px y nombre aleatorio.
export async function guardarImagenOF(file: File): Promise<{ url: string }> {
  const valida = validarArchivoImagenOF(file);
  if (!valida.ok) throw new Error(valida.error);
  let salida: Buffer;
  try {
    salida = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: OF_IMAGE_MAX_SIDE, height: OF_IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error("La imagen no se pudo procesar. Prueba con otra.");
  }
  const carpeta = path.join(process.cwd(), "public", "uploads", "of-imagenes");
  const nombre = `${randomUUID()}.webp`;
  try {
    await mkdir(carpeta, { recursive: true });
    await writeFile(path.join(carpeta, nombre), salida);
  } catch (error) {
    console.error("No se pudo guardar la imagen de la OF:", error);
    throw new Error("No se pudo guardar la imagen. Intenta de nuevo.");
  }
  return { url: `/uploads/of-imagenes/${nombre}` };
}
