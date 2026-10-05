// Versiones optimizadas de las imagenes subidas (productos y categorias).
// Junto al original (que nunca se toca) se guardan:
//   <nombre>.w400.webp   miniatura para listados y catalogo
//   <nombre>.w1200.webp  version grande para la vista de detalle
// Este archivo es puro (sin fs ni sharp) para usarlo tambien en el navegador.
// scripts/generate-image-variants.mjs repite estas constantes; una prueba
// verifica que coincidan.

export const IMAGE_VARIANT_WIDTHS = { thumb: 400, large: 1200 } as const;
export type ImageVariantSize = keyof typeof IMAGE_VARIANT_WIDTHS;
export const IMAGE_VARIANT_QUALITY = 80;
// Carpetas de /uploads cuyas imagenes tienen versiones optimizadas.
export const IMAGE_VARIANT_DIRS = ["products", "categories"] as const;

const SOURCE_EXTENSION = /\.(png|jpe?g|webp)$/i;
const VARIANT_NAME = /^(.+)\.w(\d+)\.webp$/i;
const UPLOAD_URL = new RegExp(`^(.*/uploads/(?:${IMAGE_VARIANT_DIRS.join("|")})/)([^/?#]+)([?#].*)?$`);

export function isVariantFileName(fileName: string): boolean {
  return VARIANT_NAME.test(fileName);
}

// "1782-abc.png" + 400 -> "1782-abc.w400.webp" (null si no aplica).
export function variantFileName(fileName: string, width: number): string | null {
  if (isVariantFileName(fileName) || !SOURCE_EXTENSION.test(fileName)) return null;
  return fileName.replace(SOURCE_EXTENSION, `.w${width}.webp`);
}

// "1782-abc.w400.webp" -> { baseName: "1782-abc", width: 400 } (null si no es una version).
export function parseVariantFileName(fileName: string): { baseName: string; width: number } | null {
  const match = VARIANT_NAME.exec(fileName);
  if (!match) return null;
  const width = Number(match[2]);
  const allowed = Object.values(IMAGE_VARIANT_WIDTHS) as number[];
  return allowed.includes(width) ? { baseName: match[1], width } : null;
}

// URL de la version optimizada de una imagen subida (relativa o absoluta).
// Si la imagen no es de productos/categorias, se devuelve tal cual.
export function imageVariantUrl(url: string, size: ImageVariantSize): string {
  if (!url) return url;
  const match = UPLOAD_URL.exec(url);
  if (!match) return url;
  const fileName = variantFileName(match[2], IMAGE_VARIANT_WIDTHS[size]);
  return fileName ? `${match[1]}${fileName}` : url;
}

// srcset con las dos versiones, para imagenes que se ven grandes en pantallas densas.
export function imageVariantSrcSet(url: string): string | undefined {
  const thumb = imageVariantUrl(url, "thumb");
  if (thumb === url) return undefined;
  return `${thumb} ${IMAGE_VARIANT_WIDTHS.thumb}w, ${imageVariantUrl(url, "large")} ${IMAGE_VARIANT_WIDTHS.large}w`;
}
