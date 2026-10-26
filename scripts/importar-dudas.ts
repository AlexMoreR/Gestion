// Importa "Dudas del catalogo" desde la exportacion de la encuesta de claude.ai:
//   <carpeta>/preguntas/qNNN.json  -> DudaCatalogo (upsert por id = "qNNN")
//   <carpeta>/respuestas/qNNN.json -> RespuestaDuda con id fijo "import-qNNN" y autor "Magilus (claude.ai)"
//
// Es idempotente: correrlo dos veces no duplica nada. En una pregunta que ya existe actualiza el
// texto, datos, opciones y links, pero NO toca "activa" (si se oculto a mano, sigue oculta).
// Una respuesta importada que ya existe no se pisa. Las respuestas nuevas de /dudas no se tocan.
//
// POR DEFECTO ES SIMULACION: lee y valida todo, imprime lo que haria y no escribe.
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run dudas:importar -- --carpeta="D:/Magilus/CRM-Gestion/export-dudas-2026-10-26"
//   npm run dudas:importar -- --carpeta="..." --aplicar
// Usa rutas relativas (vite-node no conoce el alias "@/").

import "dotenv/config";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { Pool } from "pg";

import {
  idDesdeArchivo,
  leerPreguntaExportada,
  leerRespuestaExportada,
  type DudaImportada,
  type RespuestaImportada,
} from "../src/modules/dudas/domain/importacion";

const AYUDA = `Importa las dudas del catalogo (por defecto SIMULACION, no escribe nada).
  --carpeta=RUTA   carpeta con preguntas/ y respuestas/ (obligatorio)
  --aplicar        escribe en la base de DATABASE_URL
Variables: DATABASE_URL.`;

function arg(nombre: string): string | undefined {
  const pref = `--${nombre}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length).replace(/^"|"$/g, "") : undefined;
}

function leerCarpeta<T>(carpeta: string, leer: (id: string, json: unknown) => T): { items: T[]; errores: string[] } {
  const items: T[] = [];
  const errores: string[] = [];
  if (!existsSync(carpeta)) return { items, errores: [`No existe la carpeta ${carpeta}`] };
  for (const archivo of readdirSync(carpeta).sort()) {
    const id = idDesdeArchivo(archivo);
    if (!id) continue; // desktop.ini y otros
    try {
      items.push(leer(id, JSON.parse(readFileSync(join(carpeta, archivo), "utf8"))));
    } catch (error) {
      errores.push(`${archivo}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { items, errores };
}

async function main() {
  if (process.argv.includes("--ayuda") || process.argv.includes("--help")) {
    console.log(AYUDA);
    return;
  }
  const carpeta = arg("carpeta");
  if (!carpeta) {
    console.error("Falta --carpeta.\n\n" + AYUDA);
    process.exitCode = 1;
    return;
  }
  const aplicar = process.argv.includes("--aplicar");

  const preguntas = leerCarpeta<DudaImportada>(join(carpeta, "preguntas"), leerPreguntaExportada);
  const respuestas = leerCarpeta<RespuestaImportada>(join(carpeta, "respuestas"), leerRespuestaExportada);
  const ids = new Set(preguntas.items.map((p) => p.id));
  const huerfanas = respuestas.items.filter((r) => !ids.has(r.dudaId));
  const errores = [...preguntas.errores, ...respuestas.errores, ...huerfanas.map((r) => `respuesta ${r.dudaId}: no hay pregunta con ese id`)];

  const porGrupo: Record<string, number> = {};
  for (const p of preguntas.items) porGrupo[p.grupo] = (porGrupo[p.grupo] ?? 0) + 1;
  console.log(`Preguntas leidas: ${preguntas.items.length}`, porGrupo);
  console.log(`Respuestas leidas: ${respuestas.items.length} (sin respuesta: ${preguntas.items.length - respuestas.items.length + huerfanas.length})`);
  if (errores.length) {
    console.error(`\n${errores.length} problema(s); no se escribe nada hasta corregirlos:`);
    for (const e of errores) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  if (!aplicar) {
    console.log("\nSIMULACION: no se escribio nada. Agrega --aplicar para escribir en DATABASE_URL.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    let nuevas = 0;
    let actualizadas = 0;
    for (const p of preguntas.items) {
      const contenido = {
        codigo: p.codigo,
        grupo: p.grupo,
        titulo: p.titulo,
        duda: p.duda,
        orden: p.orden,
        datos: p.datos as Prisma.InputJsonValue,
        opciones: p.opciones as Prisma.InputJsonValue,
        links: p.links as Prisma.InputJsonValue,
        extra: p.extra ? (p.extra as Prisma.InputJsonValue) : undefined,
      };
      const existe = await prisma.dudaCatalogo.findUnique({ where: { id: p.id }, select: { id: true } });
      await prisma.dudaCatalogo.upsert({ where: { id: p.id }, create: { id: p.id, ...contenido }, update: contenido });
      if (existe) actualizadas += 1;
      else nuevas += 1;
    }
    let respuestasNuevas = 0;
    for (const r of respuestas.items) {
      const existe = await prisma.respuestaDuda.findUnique({ where: { id: r.id }, select: { id: true } });
      if (existe) continue;
      await prisma.respuestaDuda.create({ data: { ...r, accesoId: null } });
      respuestasNuevas += 1;
    }
    console.log(`\nListo. Preguntas nuevas: ${nuevas}, actualizadas: ${actualizadas}. Respuestas importadas: ${respuestasNuevas} (ya estaban: ${respuestas.items.length - respuestasNuevas}).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
