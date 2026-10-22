import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { imageUrlKey } from "@/lib/drive-gallery";

// Peso en bytes de cada foto guardada en public/uploads (null si es un enlace externo o no esta).
export async function getLocalImageBytes(urls: string[]): Promise<Record<string, number | null>> {
  const publicDir = path.join(process.cwd(), "public");
  const entries = await Promise.all(
    urls.map(async (url) => {
      const key = imageUrlKey(url);
      if (!key.startsWith("/uploads/") || key.includes("..")) return [url, null] as const;
      try {
        const info = await stat(path.join(publicDir, ...key.split("/").filter(Boolean)));
        return [url, info.isFile() ? info.size : null] as const;
      } catch {
        return [url, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
