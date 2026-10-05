// Genera en lote las versiones WebP (400 y 1200 px) de las imagenes subidas de
// productos y categorias, sin tocar los originales. Las imagenes nuevas ya se
// convierten solas al subirlas; esto es para las que ya existian.
//
// Uso (dentro del contenedor, donde estan /app/public/uploads y sharp):
//   node generate-image-variants.mjs [--root /app/public/uploads] [--out /tmp/x] [--report /tmp/r.csv] [--force]
//   --out     escribe las versiones en otra carpeta (prueba sin tocar el volumen)
//   --report  guarda un CSV con el peso de cada imagen y sus versiones
//   --force   regenera aunque la version ya exista
// Tambien se puede pasar por stdin: docker exec -i <c> node --input-type=module - < este-archivo
//
// Mismas constantes que src/lib/image-variants.ts (una prueba verifica que coincidan).

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const VARIANT_WIDTHS = [400, 1200];
export const VARIANT_QUALITY = 80;
export const VARIANT_DIRS = ["products", "categories"];
const SOURCE_EXTENSION = /\.(png|jpe?g|webp)$/i;
const VARIANT_NAME = /\.w\d+\.webp$/i;

export function variantName(fileName, width) {
  if (VARIANT_NAME.test(fileName) || !SOURCE_EXTENSION.test(fileName)) return null;
  return fileName.replace(SOURCE_EXTENSION, `.w${width}.webp`);
}

function parseArgs(argv) {
  const args = { root: path.join(process.cwd(), "public", "uploads"), out: null, report: null, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--root") args.root = argv[++index];
    else if (flag === "--out") args.out = argv[++index];
    else if (flag === "--report") args.report = argv[++index];
    else if (flag === "--force") args.force = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const sharp = require("sharp");
  sharp.concurrency(1); // suave con el servidor

  const rows = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const dir of VARIANT_DIRS) {
    const sourceDir = path.join(args.root, dir);
    if (!existsSync(sourceDir)) continue;
    const targetDir = args.out ? path.join(args.out, dir) : sourceDir;
    await mkdir(targetDir, { recursive: true });

    const files = (await readdir(sourceDir)).filter((name) => SOURCE_EXTENSION.test(name) && !VARIANT_NAME.test(name));
    for (const fileName of files) {
      const sourcePath = path.join(sourceDir, fileName);
      const row = { carpeta: dir, archivo: fileName, original_bytes: (await stat(sourcePath)).size, ancho: 0, alto: 0 };
      try {
        const meta = await sharp(sourcePath).metadata();
        row.ancho = meta.width ?? 0;
        row.alto = meta.height ?? 0;
        for (const width of VARIANT_WIDTHS) {
          const targetPath = path.join(targetDir, variantName(fileName, width));
          if (existsSync(targetPath) && !args.force) {
            skipped += 1;
          } else {
            await sharp(sourcePath)
              .rotate()
              .resize({ width, withoutEnlargement: true })
              .webp({ quality: VARIANT_QUALITY })
              .toFile(targetPath);
            created += 1;
          }
          row[`w${width}_bytes`] = (await stat(targetPath)).size;
        }
      } catch (error) {
        failed += 1;
        row.error = String(error?.message ?? error);
      }
      rows.push(row);
    }
  }

  if (args.report) {
    const header = ["carpeta", "archivo", "ancho", "alto", "original_bytes", "w400_bytes", "w1200_bytes", "error"];
    const csv = [header.join(",")]
      .concat(rows.map((row) => header.map((key) => JSON.stringify(row[key] ?? "")).join(",")))
      .join("\n");
    await writeFile(args.report, csv, "utf8");
  }

  const sum = (key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  console.log(
    JSON.stringify({
      imagenes: rows.length,
      versiones_creadas: created,
      versiones_ya_existian: skipped,
      con_error: failed,
      original_mb: +(sum("original_bytes") / 1048576).toFixed(1),
      w400_mb: +(sum("w400_bytes") / 1048576).toFixed(1),
      w1200_mb: +(sum("w1200_bytes") / 1048576).toFixed(1),
    }),
  );
}

// Se ejecuta solo como programa (no al importarlo en las pruebas).
const isEntry = !process.argv[1] || process.argv[1] === "-" || import.meta.url.endsWith(path.basename(process.argv[1]));
if (isEntry && !process.env.VITEST) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
