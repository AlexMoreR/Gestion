// Foto de vista previa al compartir (WhatsApp, Facebook, Twitter): copia JPEG 1200x630
// de una imagen subida, servida por src/app/og/[...path]/route.ts. Puro (sin fs ni sharp).
import { IMAGE_VARIANT_DIRS } from "./image-variants";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const OG_DIRS: readonly string[] = IMAGE_VARIANT_DIRS;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp)$/i;
const UPLOAD_URL = new RegExp(`^(?:https?://[^/]+)?/uploads/(${IMAGE_VARIANT_DIRS.join("|")})/([^/?#]+)(?:[?#].*)?$`, "i");
const SITE_HOST = /^https?:\/\/(?:www\.)?magilus\.com\//i;

// ["products", "x.png"] -> { dir, fileName } solo si la carpeta esta permitida y el nombre es simple.
export function parseOgSegments(segments: string[]): { dir: string; fileName: string } | null {
  if (segments.length !== 2) return null;
  const [dir, fileName] = segments;
  if (!OG_DIRS.includes(dir) || fileName.includes("..") || !SAFE_FILE_NAME.test(fileName)) return null;
  return { dir, fileName };
}

// "/uploads/products/x.png" (o https://magilus.com/uploads/...) -> "/og/products/x.png"; si no aplica, null.
export function ogImageUrl(url: string | null | undefined, siteUrl = ""): string | null {
  const value = url?.trim() ?? "";
  if (!value) return null;
  const isAbsolute = /^https?:\/\//i.test(value);
  const sameSite = !isAbsolute || SITE_HOST.test(value) || (siteUrl !== "" && value.startsWith(siteUrl.replace(/\/+$/, "") + "/"));
  if (!sameSite) return null;
  const match = UPLOAD_URL.exec(value);
  if (!match || !parseOgSegments([match[1], match[2]])) return null;
  return `/og/${match[1]}/${match[2]}`;
}
