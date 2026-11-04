import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recolorear } from "./recolor-image.server";

// Foto de 8x8 gris (180) con una sombra (90) en las columnas 0 y 1. La máscara marca la mitad izquierda.
const LADO = 8;

async function fotoGris(): Promise<Buffer> {
  const data = Buffer.alloc(LADO * LADO * 3, 180);
  for (let y = 0; y < LADO; y++) data.fill(90, y * LADO * 3, (y * LADO + 2) * 3);
  return sharp(data, { raw: { width: LADO, height: LADO, channels: 3 } }).png().toBuffer();
}

async function mascaraIzquierda(): Promise<Buffer> {
  const data = Buffer.alloc(LADO * LADO, 0);
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO / 2; x++) data[y * LADO + x] = 255;
  return sharp(data, { raw: { width: LADO, height: LADO, channels: 1 } }).png().toBuffer();
}

async function pixeles(webp: Buffer) {
  const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
}

let carpeta: string;
beforeEach(async () => {
  carpeta = await mkdtemp(path.join(tmpdir(), "vista-color-"));
});
afterEach(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

describe("recolorear", () => {
  it("pinta la zona de la máscara del color, conserva la sombra y no toca el resto", async () => {
    const r = await recolorear({ fotoBase: await fotoGris(), partes: [{ mascara: await mascaraIzquierda(), hex: "#C83C3C" }], uploadsRoot: carpeta });
    expect(r?.url).toMatch(/^\/uploads\/vista-color\/[0-9a-f]{40}\.webp$/);
    const px = await pixeles(r!.buffer);
    const [rojo, verde] = px(3, 4);
    expect(rojo).toBeGreaterThan(verde + 80); // tomó el color
    expect(px(0, 4)[0]).toBeLessThan(rojo - 40); // la sombra sigue más oscura
    for (const valor of px(6, 4)) expect(Math.abs(valor - 180)).toBeLessThan(12); // la otra mitad sigue gris
  });

  it("sin máscara o sin color no hay vista previa", async () => {
    const foto = await fotoGris();
    const mascara = await mascaraIzquierda();
    expect(await recolorear({ fotoBase: foto, partes: [{ mascara: null, hex: "#C83C3C" }], uploadsRoot: carpeta })).toBeNull();
    expect(await recolorear({ fotoBase: foto, partes: [{ mascara }], uploadsRoot: carpeta })).toBeNull();
    expect(await recolorear({ fotoBase: foto, partes: [{ mascara, hex: "rojo" }], uploadsRoot: carpeta })).toBeNull();
    expect(await recolorear({ fotoBase: foto, partes: [], uploadsRoot: carpeta })).toBeNull();
  });

  it("sin código de color usa la foto de la muestra en mosaico", async () => {
    const muestra = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#2050D0" } }).png().toBuffer();
    const r = await recolorear({ fotoBase: await fotoGris(), partes: [{ mascara: await mascaraIzquierda(), texturaUrl: muestra }], uploadsRoot: carpeta });
    const [rojo, , azul] = (await pixeles(r!.buffer))(2, 6);
    expect(azul).toBeGreaterThan(rojo + 80);
  });

  it("la misma llamada no vuelve a hacer la imagen", async () => {
    const entrada = { fotoBase: await fotoGris(), partes: [{ mascara: await mascaraIzquierda(), hex: "#C9A24A" }], uploadsRoot: carpeta };
    const primera = await recolorear(entrada);
    const archivo = path.join(carpeta, primera!.url.replace("/uploads/", ""));
    const antes = (await stat(archivo)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const segunda = await recolorear(entrada);
    expect(segunda!.url).toBe(primera!.url);
    expect((await stat(archivo)).mtimeMs).toBe(antes);
    expect(await readdir(path.join(carpeta, "vista-color"))).toEqual([path.basename(archivo)]);
  });

  it("no lee rutas fuera de uploads ni sitios distintos al CRM", async () => {
    const mascara = await mascaraIzquierda();
    await expect(recolorear({ fotoBase: "/uploads/../../etc/passwd", partes: [{ mascara, hex: "#ffffff" }], uploadsRoot: carpeta })).rejects.toThrow();
    await expect(recolorear({ fotoBase: "https://otro.example.com/a.png", partes: [{ mascara, hex: "#ffffff" }], uploadsRoot: carpeta })).rejects.toThrow();
  });
});
