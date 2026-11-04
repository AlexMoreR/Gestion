// Correccion de UNA SOLA VEZ (nov-2026): 5 productos visibles en la tienda con una palabra mal escrita
// en el nombre. Solo cambia esa palabra dentro del nombre de hoy (el resto queda igual) y solo el
// campo `name`: nunca precio, codigo ni enlace (slug).
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar --tarjeta T-xxx (transaccion + firma en
// ActivityLog). Se puede correr dos veces: si la palabra mala ya no esta, ese producto se salta.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exigirTarjeta, firmar } from "./firma.mjs";

// Letras con o sin tilde: la palabra se cambia solo si esta completa (no dentro de otra).
const L = "\\p{L}";
export const CORRECCIONES = [
  { codigo: "ESV010", mala: new RegExp(`(?<!${L})EMALTERO(?!${L})`, "iu"), buena: "ESMALTERO" },
  { codigo: "CMB015", mala: new RegExp(`(?<!${L})LAHISTA(?!${L})`, "iu"), buena: "LASHISTA" },
  { codigo: "SNV004", mala: new RegExp(`(?<!${L})RETANGULAR(?!${L})`, "iu"), buena: "RECTANGULAR" },
  { codigo: "SMV001", mala: new RegExp(`(?<!${L})MANY\\s+Y\\s+PEDI(?!${L})`, "iu"), buena: "MANÍ Y PEDÍ" },
  // Solo al final del nombre, para no tocar "3 PIEZAS".
  { codigo: "CMB009", mala: new RegExp(`(?<![${L}\\d])3\\s+PIEZA(?=\\s*$)`, "iu"), buena: "3 PIEZAS" },
];

// La palabra nueva respeta las mayusculas de la que reemplaza (los nombres de hoy van en MAYUSCULAS).
function conMismasMayusculas(original, buena) {
  if (original === original.toUpperCase()) return buena.toUpperCase();
  if (original === original.toLowerCase()) return buena.toLowerCase();
  return buena.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, espacio, letra) => espacio + letra.toUpperCase());
}

/**
 * Regla pura: con los productos de hoy ({ id, code, name }) dice que cambia y que se salta.
 * @returns {{ cambios: { id: string, codigo: string, actual: string, nuevo: string }[], saltados: { codigo: string, motivo: string }[] }}
 */
export function planearCorrecciones(productos) {
  const cambios = [];
  const saltados = [];
  for (const { codigo, mala, buena } of CORRECCIONES) {
    const producto = productos.find((p) => p.code === codigo);
    if (!producto) {
      saltados.push({ codigo, motivo: "no existe ese código" });
      continue;
    }
    if (!mala.test(producto.name)) {
      saltados.push({ codigo, motivo: `ya no tiene la palabra mala ("${producto.name}")` });
      continue;
    }
    const nuevo = producto.name.replace(mala, (m) => conMismasMayusculas(m, buena));
    cambios.push({ id: producto.id, codigo, actual: producto.name, nuevo });
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
      where: { code: { in: CORRECCIONES.map((c) => c.codigo) } },
      select: { id: true, code: true, name: true },
    });
    const plan = planearCorrecciones(productos);
    for (const linea of lineasDelPlan(plan, aplicar)) console.log(linea);
    if (!aplicar || plan.cambios.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const c of plan.cambios) {
        await tx.product.update({ where: { id: c.id }, data: { name: c.nuevo } });
      }
      await firmar(tx, {
        script: "corregir-nombres-productos",
        tarjeta,
        resumen: `Corrigió el nombre de ${plan.cambios.length} producto(s): ${plan.cambios.map((c) => c.codigo).join(", ")}`,
        after: plan.cambios.map(({ codigo, actual, nuevo }) => ({ codigo, antes: actual, despues: nuevo })),
      });
    });
    console.log(`Listo: ${plan.cambios.length} nombre(s) corregido(s).`);
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
