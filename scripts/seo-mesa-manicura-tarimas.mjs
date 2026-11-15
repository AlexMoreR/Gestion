// Cambio de UNA SOLA VEZ (nov-2026): título y descripción en Google de 2 categorías (mesas de
// manicura y tarimas de pedicure). Solo los campos `seoTitle` y `seoDescription`: nunca nombre,
// enlace (slug), descripción, logo ni productos.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar --tarjeta T-xxx (transaccion + firma en
// ActivityLog). Se puede correr dos veces: si ya tiene los textos nuevos, esa categoría se salta.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exigirTarjeta, firmar } from "./firma.mjs";

// Tabla fija. El título va SIN " | Magilus": lo pega src/app/layout.tsx.
export const TEXTOS_SEO = [
  {
    slug: "mesa-manicura",
    seoTitle: "Mesa de manicura de fábrica, envío a toda Colombia",
    seoDescription:
      "Mesas de manicura fabricadas por Magilus en Cali y Bogotá. Envío a toda Colombia y garantía de 1 año. Mira modelos y precios y cotiza por WhatsApp.",
  },
  {
    slug: "tarimas-pedicure",
    seoTitle: "Tarimas pedicure de fábrica, envío a toda Colombia",
    seoDescription:
      "Tarimas de pedicure fabricadas por Magilus en Cali y Bogotá. Envío a toda Colombia y garantía de 1 año. Mira modelos y precios y cotiza por WhatsApp.",
  },
];

const limpio = (texto) => String(texto ?? "").trim();

/**
 * Regla pura: con las categorías de hoy ({ id, slug, seoTitle, seoDescription }) dice qué cambia y
 * qué se salta. Reemplaza lo que haya (aunque esté vacío o escrito a mano) salvo que ya tenga los dos
 * textos nuevos.
 */
export function planearSeo(categorias) {
  const cambios = [];
  const saltados = [];
  for (const { slug, seoTitle, seoDescription } of TEXTOS_SEO) {
    const categoria = categorias.find((c) => c.slug === slug);
    if (!categoria) {
      saltados.push({ slug, motivo: "no existe ese enlace" });
      continue;
    }
    const antes = { seoTitle: limpio(categoria.seoTitle), seoDescription: limpio(categoria.seoDescription) };
    if (antes.seoTitle === seoTitle && antes.seoDescription === seoDescription) {
      saltados.push({ slug, motivo: "ya tiene los textos nuevos" });
      continue;
    }
    cambios.push({ id: categoria.id, slug, antes, despues: { seoTitle, seoDescription } });
  }
  return { cambios, saltados };
}

/** Lineas que se imprimen: título y descripción "antes" → "después" y los saltados con su motivo. */
export function lineasDelPlan({ cambios, saltados }, aplicar) {
  return [
    aplicar ? "APLICAR: se escriben los textos nuevos." : "SIMULACION: no se escribe nada (usa --aplicar --tarjeta T-xxx).",
    ...cambios.flatMap((c) => [
      `  ${c.slug}: título "${c.antes.seoTitle}" → "${c.despues.seoTitle}"`,
      `  ${c.slug}: descripción "${c.antes.seoDescription}" → "${c.despues.seoDescription}"`,
    ]),
    ...saltados.map((s) => `  ${s.slug}: se salta, ${s.motivo}`),
  ];
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const tarjeta = exigirTarjeta(process.argv); // antes de conectarse a la base

  if (!process.env.DATABASE_URL) {
    try {
      const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
      const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
      if (match) process.env.DATABASE_URL = match[1];
    } catch {
      // sin .env: se confia en el entorno
    }
  }
  const [{ PrismaClient }, { PrismaPg }, { Pool }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
    import("pg"),
  ]);
  const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
  });

  try {
    const categorias = await prisma.category.findMany({
      where: { slug: { in: TEXTOS_SEO.map((t) => t.slug) } },
      select: { id: true, slug: true, seoTitle: true, seoDescription: true },
    });
    const plan = planearSeo(categorias);
    for (const linea of lineasDelPlan(plan, aplicar)) console.log(linea);
    if (!aplicar || plan.cambios.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const c of plan.cambios) {
        await tx.category.update({ where: { id: c.id }, data: c.despues });
      }
      await firmar(tx, {
        script: "seo-mesa-manicura-tarimas",
        tarjeta,
        resumen: "SEO de categorías mesa-manicura y tarimas-pedicure: título y descripción nuevos",
        after: { cambios: plan.cambios },
      });
    });
    console.log(`Listo: ${plan.cambios.length} categoría(s) con textos nuevos.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
