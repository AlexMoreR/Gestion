import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { guardarImagenFicha } from "./fichas-storage";

const ID = "1kne5Sw6t_1pIiGdhKmhVxIQC8uQGiUyr";
const raiz = mkdtempSync(join(tmpdir(), "fichas-"));
afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("guardarImagenFicha", () => {
  it("guarda una ficha pequena (sin minimo de 800 px) como JPG con nombre fijo", async () => {
    const png = await sharp({ create: { width: 300, height: 420, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const { url, filePath } = await guardarImagenFicha(png, { driveFileId: ID, uploadsRoot: raiz });
    expect(url).toBe(`/uploads/products/ficha-${ID}.jpg`);
    expect(existsSync(filePath)).toBe(true);
    const meta = await sharp(filePath).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([300, 420]);
  });

  it("rechaza lo que no es imagen", async () => {
    await expect(guardarImagenFicha(Buffer.from("hola"), { driveFileId: null, uploadsRoot: raiz })).rejects.toThrow(
      /no es una imagen/,
    );
  });
});
