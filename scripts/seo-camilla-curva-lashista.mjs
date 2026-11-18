// Cambio de UNA SOLA VEZ (nov-2026): SEO de la ficha /camilla/camilla-curva-lashista-cav14.
// Toca solo `seoTitle`, `seoDescription` y `description` (el párrafo nuevo va ANTES de la descripción
// de hoy, que queda al final tal cual para no perder la medida). Nunca nombre, código, slug ni precio.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar --tarjeta T-xxx (transaccion + firma en
// ActivityLog). Se puede correr dos veces: si ya tiene los textos nuevos, se salta.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exigirTarjeta, firmar } from "./firma.mjs";

export const SLUG = "camilla-curva-lashista-cav14";

// El título va SIN " | Magilus": lo pega la página del producto.
export const SEO_TITLE = "Camilla curva para lashista | Fabricante en Colombia";
export const SEO_DESCRIPTION =
  "Camilla curva para lashista: tu clienta cómoda y tu espalda descansada en cada sesión. Fabricante en Colombia, envío a toda Colombia y garantía de 1 año.";
export const PARRAFO =
  "La camilla curva para lashista de Magilus está pensada para quien hace extensiones y lifting de pestañas muchas horas al día. Su forma curva acompaña la espalda, el cuello y las piernas de tu clienta, para que se relaje y se quede quieta durante toda la sesión. Por eso muchas profesionales la buscan como camilla para pestañas: tu clienta descansa cómoda y tú trabajas más cerca de sus ojos, sin forzar la espalda. Es una camilla curva hecha en nuestra fábrica en Colombia, con sedes en Cali y Bogotá. Puedes pedirla en el color que combine con tu estudio; la asesora te muestra los colores disponibles por WhatsApp. Si buscas una camilla para lashista que te acompañe por años, esta tiene garantía de 1 año y hacemos envío a toda Colombia. Escríbenos y te ayudamos a elegir la que mejor va con tu espacio.";

const limpio = (texto) => String(texto ?? "").trim();

/** Descripción nueva: el párrafo y, debajo, la de hoy tal cual (si había). */
export function descripcionNueva(actual) {
  const hoy = limpio(actual);
  return hoy ? `${PARRAFO}\n\n${hoy}` : PARRAFO;
}

/**
 * Regla pura: con el producto de hoy ({ id, slug, seoTitle, seoDescription, description } o null)
 * dice qué cambia o por qué se salta.
 */
export function planearSeo(producto) {
  if (!producto) return { cambios: [], saltados: [{ slug: SLUG, motivo: "no existe ese enlace" }] };
  const antes = {
    seoTitle: limpio(producto.seoTitle),
    seoDescription: limpio(producto.seoDescription),
    description: limpio(producto.description),
  };
  if (antes.seoTitle === SEO_TITLE && antes.seoDescription === SEO_DESCRIPTION && antes.description.startsWith(PARRAFO)) {
    return { cambios: [], saltados: [{ slug: SLUG, motivo: "ya tiene los textos nuevos" }] };
  }
  // Si el párrafo ya estaba puesto, no se repite.
  const description = antes.description.startsWith(PARRAFO) ? antes.description : descripcionNueva(antes.description);
  return {
    cambios: [{ id: producto.id, slug: SLUG, antes, despues: { seoTitle: SEO_TITLE, seoDescription: SEO_DESCRIPTION, description } }],
    saltados: [],
  };
}

/** Lineas que se imprimen: cada campo "antes" → "después" y los saltados con su motivo. */
export function lineasDelPlan({ cambios, saltados }, aplicar) {
  return [
    aplicar ? "APLICAR: se escriben los textos nuevos." : "SIMULACION: no se escribe nada (usa --aplicar --tarjeta T-xxx).",
    ...cambios.flatMap((c) => [
      `  ${c.slug}: título "${c.antes.seoTitle}" → "${c.despues.seoTitle}"`,
      `  ${c.slug}: descripción en Google "${c.antes.seoDescription}" → "${c.despues.seoDescription}"`,
      `  ${c.slug}: descripción de la ficha "${c.antes.description}" → "${c.despues.description}"`,
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
    const producto = await prisma.product.findFirst({
      where: { slug: SLUG },
      select: { id: true, slug: true, seoTitle: true, seoDescription: true, description: true },
    });
    const plan = planearSeo(producto);
    for (const linea of lineasDelPlan(plan, aplicar)) console.log(linea);
    if (!aplicar || plan.cambios.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const c of plan.cambios) {
        await tx.product.update({ where: { id: c.id }, data: c.despues });
      }
      await firmar(tx, {
        script: "seo-camilla-curva-lashista",
        tarjeta,
        resumen: "SEO de la ficha camilla-curva-lashista-cav14: título, descripción y párrafo nuevos",
        after: { cambios: plan.cambios },
      });
    });
    console.log(`Listo: ${plan.cambios.length} producto con textos nuevos.`);
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
