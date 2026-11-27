import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, parseOgSegments } from "@/lib/og-image";

// Copia JPEG 1200x630 de una foto de producto o categoria para la vista previa al compartir.
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const parsed = parseOgSegments(segments);
  if (!parsed) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", parsed.dir, parsed.fileName);
  let source: Buffer;
  try {
    source = await readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  try {
    const jpeg = await sharp(source)
      .rotate()
      .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[og] No se pudo convertir la imagen:", error);
    return new Response("Not found", { status: 404 });
  }
}
