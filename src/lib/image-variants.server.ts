import "server-only";
import { randomUUID } from "node:crypto";
import { access, rename, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  IMAGE_VARIANT_QUALITY,
  IMAGE_VARIANT_WIDTHS,
  parseVariantFileName,
  variantFileName,
} from "@/lib/image-variants";

// Genera (o regenera) una version WebP de una imagen, sin tocar el original.
// Se escribe en un temporal y se renombra, para no servir nunca un archivo a medias.
async function writeVariant(sourcePath: string, targetPath: string, width: number): Promise<void> {
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await sharp(sourcePath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: IMAGE_VARIANT_QUALITY })
      .toFile(tempPath);
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

// Crea las versiones de 400 y 1200 px junto a una imagen recien subida.
// Nunca lanza: si falla, la ruta /uploads las genera la primera vez que se piden.
export async function createImageVariants(sourcePath: string): Promise<void> {
  const dir = path.dirname(sourcePath);
  const fileName = path.basename(sourcePath);
  for (const width of Object.values(IMAGE_VARIANT_WIDTHS)) {
    const name = variantFileName(fileName, width);
    if (!name) return;
    try {
      await writeVariant(sourcePath, path.join(dir, name), width);
    } catch (error) {
      console.error(`[image-variants] No se pudo crear ${name}:`, error);
    }
  }
}

// Borra las versiones de una imagen (cuando se borra el original).
export async function deleteImageVariants(sourcePath: string): Promise<void> {
  const dir = path.dirname(sourcePath);
  const fileName = path.basename(sourcePath);
  for (const width of Object.values(IMAGE_VARIANT_WIDTHS)) {
    const name = variantFileName(fileName, width);
    if (!name) return;
    await unlink(path.join(dir, name)).catch(() => undefined);
  }
}

const SOURCE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".PNG", ".JPG", ".JPEG", ".WEBP"];

// Para una version que aun no existe en disco ("x.w400.webp"), busca el original
// y la genera. Devuelve la ruta de la version creada o null si no aplica.
export async function generateMissingVariant(variantPath: string): Promise<string | null> {
  const parsed = parseVariantFileName(path.basename(variantPath));
  if (!parsed) return null;
  const dir = path.dirname(variantPath);

  for (const ext of SOURCE_EXTENSIONS) {
    const sourcePath = path.join(dir, `${parsed.baseName}${ext}`);
    try {
      await access(sourcePath);
    } catch {
      continue;
    }
    await writeVariant(sourcePath, variantPath, parsed.width);
    return variantPath;
  }
  return null;
}
