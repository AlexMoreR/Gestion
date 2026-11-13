// Cambio de UNA SOLA VEZ (nov-2026): 6 camillas cuyo nombre no empieza por "CAMILLA". Solo el campo
// `name`: nunca precio, codigo, enlace (slug), descripcion ni SEO.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar --tarjeta T-xxx (transaccion + firma en
// ActivityLog). Se puede correr dos veces: si el nombre ya es el nuevo, ese producto se salta.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exigirTarjeta, firmar } from "./firma.mjs";

// Tabla fija con el nombre de hoy y el nuevo. CAV006 lleva "3" (no "TRES") para no quedar igual
// que el CAV008 "CAMILLA TRES CUERPOS CON CAJONES".
export const RENOMBRES = [
  { codigo: "CAV004", antes: "2 CUERPOS OVAL", nuevo: "CAMILLA 2 CUERPOS OVAL" },
  { codigo: "CAV005", antes: "3 CUERPOS BRAZOS CORTOS", nuevo: "CAMILLA 3 CUERPOS BRAZOS CORTOS" },
  { codigo: "CAV015", antes: "3 CUERPOS CON BRAZOS", nuevo: "CAMILLA 3 CUERPOS CON BRAZOS" },
  { codigo: "CAV007", antes: "3 CUERPOS TATOOT", nuevo: "CAMILLA 3 CUERPOS TATTOO" },
  { codigo: "CAV009", antes: "EN MADERA CABECERO", nuevo: "CAMILLA EN MADERA CABECERO" },
  { codigo: "CAV006", antes: "TRES CUERPOS CON CAJONES", nuevo: "CAMILLA 3 CUERPOS CON CAJONES" },
];

/**
 * Regla pura: con los productos de hoy ({ id, code, name }) dice que cambia y que se salta.
 * Solo cambia si el nombre de hoy (sin espacios en los extremos) es exactamente `antes`.
 * @returns {{ cambios: { id: string, codigo: string, actual: string, nuevo: string }[], saltados: { codigo: string, motivo: string }[] }}
 */
export function planearCamilla(productos) {
  const cambios = [];
  const saltados = [];
  for (const { codigo, antes, nuevo } of RENOMBRES) {
    const producto = productos.find((p) => p.code === codigo);
    if (!producto) {
      saltados.push({ codigo, motivo: "no existe ese código" });
      continue;
    }
    const actual = String(producto.name ?? "").trim();
    if (actual === nuevo) {
      saltados.push({ codigo, motivo: "ya tiene el nombre nuevo" });
      continue;
    }
    if (actual !== antes) {
      saltados.push({ codigo, motivo: `tiene otro nombre ("${actual}")` });
      continue;
    }
    cambios.push({ id: producto.id, codigo, actual, nuevo });
  }
  return { cambios, saltados };
}

/** Lineas que se imprimen: "CODIGO: actual → nuevo" y los saltados con su motivo. */
export function lineasDelPlan({ cambios, saltados }, aplicar) {
  return [
    aplicar ? "APLICAR: se escriben los nombres nuevos." : "SIMULACION: no se escribe nada (usa --aplicar --tarjeta T-xxx).",
    ...cambios.map((c) => `  ${c.codigo}: "${c.actual}" → "${c.nuevo}"`),
    ...saltados.map((s) => `  ${s.codigo}: se salta, ${s.motivo}`),
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
    const productos = await prisma.product.findMany({
      where: { code: { in: RENOMBRES.map((r) => r.codigo) } },
      select: { id: true, code: true, name: true },
    });
    const plan = planearCamilla(productos);
    for (const linea of lineasDelPlan(plan, aplicar)) console.log(linea);
    if (!aplicar || plan.cambios.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const c of plan.cambios) {
        await tx.product.update({ where: { id: c.id }, data: { name: c.nuevo } });
      }
      await firmar(tx, {
        script: "camilla-al-inicio-nombres",
        tarjeta,
        resumen: `Puso CAMILLA al inicio del nombre de ${plan.cambios.length} producto(s): ${plan.cambios.map((c) => c.codigo).join(", ")}`,
        after: plan.cambios.map(({ codigo, actual, nuevo }) => ({ codigo, antes: actual, despues: nuevo })),
      });
    });
    console.log(`Listo: ${plan.cambios.length} nombre(s) cambiado(s).`);
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
