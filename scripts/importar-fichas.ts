// Importa FICHAS TECNICAS (ProductImage.tipo = "ficha") desde un CSV y una carpeta de imagenes.
//   CSV: codigo,ficha,driveFileId,nota   (una fila por ficha; un producto puede tener varias)
//   Carpeta: las imagenes llamadas <driveFileId>.jpg (tambien .jpeg, .png o .webp)
//
// Idempotente: si el producto ya tiene una ficha con ese driveFileId, la salta.
// POR DEFECTO ES SIMULACION: lee y valida todo, consulta la base (solo lectura), imprime lo que
// haria y no escribe. Con --aplicar guarda la imagen en <uploads>/products/ficha-<driveFileId>.jpg
// y crea la fila (tipo "ficha", origen "drive", al final del orden).
//
// IMPORTANTE (produccion): las imagenes deben quedar en el volumen magilus_uploads del servidor.
// Si este script corre en tu PC con --aplicar, la imagen queda en TU disco y la fila en la base:
// la tienda mostraria una imagen rota. Para produccion usa la pagina /admin/productos/fichas
// (sube por la app, al volumen correcto). Este script sirve para simular y para desarrollo local.
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run fichas:importar -- --csv="D:/Magilus/CRM-Gestion/fichas-seguras-2026-10-26.csv" --carpeta="D:/Magilus/CRM-Gestion/fichas-2026-10-26"
//   npm run fichas:importar -- --csv=... --carpeta=... --aplicar [--uploads="ruta/a/public/uploads"]
// Usa rutas relativas (vite-node no conoce el alias "@/").

import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { carpetaUploadsPorDefecto, guardarImagenFicha } from "../src/lib/fichas-storage";
import {
  driveIdDeArchivo,
  leerCsvFichas,
  planearImportacionFichas,
  siguienteOrden,
  TIPO_FICHA,
} from "../src/lib/product-fichas";

const AYUDA = `Importa fichas tecnicas (por defecto SIMULACION, no escribe nada).
  --csv=RUTA       CSV con columnas codigo,ficha,driveFileId,nota (obligatorio)
  --carpeta=RUTA   carpeta con las imagenes <driveFileId>.jpg (obligatorio)
  --aplicar        guarda las imagenes y escribe en la base de DATABASE_URL
  --uploads=RUTA   carpeta "uploads" donde guardar (por defecto ./public/uploads)
Variables: DATABASE_URL.`;

function arg(nombre: string): string | undefined {
  const pref = `--${nombre}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length).replace(/^"|"$/g, "") : undefined;
}

function leerCarpeta(carpeta: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const archivo of readdirSync(carpeta)) {
    const id = driveIdDeArchivo(archivo);
    if (id) map.set(id, join(carpeta, archivo));
  }
  return map;
}

async function main() {
  if (process.argv.includes("--ayuda") || process.argv.includes("--help")) {
    console.log(AYUDA);
    return;
  }
  const csvPath = arg("csv");
  const carpeta = arg("carpeta");
  if (!csvPath || !carpeta) {
    console.error("Faltan --csv y/o --carpeta.\n\n" + AYUDA);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(csvPath)) throw new Error(`No existe el CSV ${csvPath}`);
  if (!existsSync(carpeta)) throw new Error(`No existe la carpeta ${carpeta}`);
  const aplicar = process.argv.includes("--aplicar");
  const uploadsRoot = arg("uploads") ?? carpetaUploadsPorDefecto();

  const { filas, errores } = leerCsvFichas(readFileSync(csvPath, "utf8"));
  const imagenes = leerCarpeta(carpeta);
  console.log(`Filas validas en el CSV: ${filas.length} (productos: ${new Set(filas.map((f) => f.codigo)).size})`);
  console.log(`Imagenes reconocidas en la carpeta: ${imagenes.size}`);
  for (const error of errores) console.warn(`  ! ${error}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL");
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const productos = await prisma.product.findMany({
      where: { code: { in: [...new Set(filas.map((f) => f.codigo))] } },
      select: { id: true, code: true, images: { where: { tipo: TIPO_FICHA }, select: { driveFileId: true } } },
    });
    const plan = planearImportacionFichas(
      filas,
      productos.map((p) => ({
        id: p.id,
        code: p.code,
        fichasDriveIds: p.images.map((i) => i.driveFileId).filter((id): id is string => !!id),
      })),
      new Set(imagenes.keys()),
    );

    console.log(
      `\nPlan: crear ${plan.resumen.crear} · ya estaban ${plan.resumen.yaExiste} · sin producto ${plan.resumen.sinProducto} · sin imagen ${plan.resumen.sinImagen}`,
    );
    if (plan.codigosInexistentes.length) console.log(`Codigos que NO existen en Gestion: ${plan.codigosInexistentes.join(", ")}`);
    for (const accion of plan.acciones) {
      if (accion.tipo === "sin-imagen") console.log(`  - ${accion.fila.codigo}: falta ${accion.fila.driveFileId}.jpg`);
    }

    if (!aplicar) {
      console.log("\nSIMULACION: no se escribio nada. Agrega --aplicar para guardar.");
      return;
    }

    console.log(`\nGuardando en ${uploadsRoot}/products ...`);
    let creadas = 0;
    let fallidas = 0;
    for (const accion of plan.acciones) {
      if (accion.tipo !== "crear") continue;
      const { fila, productId } = accion;
      try {
        const buffer = readFileSync(imagenes.get(fila.driveFileId)!);
        const { url } = await guardarImagenFicha(buffer, { driveFileId: fila.driveFileId, uploadsRoot });
        const estado = await prisma.$transaction(async (tx) => {
          const actuales = await tx.productImage.findMany({
            where: { productId },
            select: { order: true, tipo: true, driveFileId: true },
          });
          if (actuales.some((i) => i.tipo === TIPO_FICHA && i.driveFileId === fila.driveFileId)) return "ya-existe";
          await tx.productImage.create({
            data: { productId, url, order: siguienteOrden(actuales), tipo: TIPO_FICHA, driveFileId: fila.driveFileId, origen: "drive" },
          });
          return "creada";
        });
        if (estado === "creada") creadas += 1;
        console.log(`  ${estado === "creada" ? "+" : "="} ${fila.codigo} ${fila.ficha} -> ${url}`);
      } catch (error) {
        fallidas += 1;
        console.error(`  x ${fila.codigo}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log(`\nListo: ${creadas} creada(s), ${fallidas} con error.`);
    if (fallidas) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
