// Corrige cargos de COMPRA DE INVENTARIO historicos que se guardaron con el
// costo UNITARIO en vez del total (costo unitario x cantidad).
//
// Contexto: el formulario muestra el total (unitario x cantidad), pero el
// server action guardaba solo el unitario. La nota de cada cargo conserva la
// cantidad comprada como "(... x{N})", que es exactamente el multiplicador que
// faltaba aplicar. Por eso: total correcto = amount * N.
//
// Solo afecta cargos cuya nota empieza por "Compra inventario" (producto y
// componentes de combo). El "Costo adicional" (transporte) es un monto fijo y
// su nota NO empieza asi, por lo que queda excluido.
//
// IMPORTANTE: es una migracion de UNA SOLA VEZ y NO es idempotente (volver a
// correrla con --apply duplicaria los montos). Ejecutar una vez, junto con el
// despliegue del fix. Por defecto corre en DRY-RUN; usa --apply para escribir.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Carga DATABASE_URL desde .env si no esta en el entorno.
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) process.env.DATABASE_URL = match[1];
  } catch {
    // sin .env: se confia en el entorno
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

const APPLY = process.argv.includes("--apply");

// Extrae la cantidad del final de la nota: "... (x3)" o "... Combo X x3)".
function parseQty(note) {
  if (!note) return null;
  const match = note.match(/x\s*(\d+)\)\s*$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const charges = await prisma.supplierLedgerEntry.findMany({
  where: {
    type: "CHARGE",
    inventoryMovementId: { not: null },
    note: { startsWith: "Compra inventario" },
  },
  select: { id: true, code: true, amount: true, note: true },
  orderBy: { createdAt: "asc" },
});

console.log(`Cargos de compra de inventario encontrados: ${charges.length}\n`);

const updates = [];
const skipped = [];
for (const charge of charges) {
  const qty = parseQty(charge.note);
  if (qty === null) {
    skipped.push({ ...charge, reason: "sin cantidad en la nota" });
    continue;
  }
  if (qty === 1) {
    skipped.push({ ...charge, reason: "cantidad 1 (sin cambio)" });
    continue;
  }
  const oldAmount = Number(charge.amount);
  const newAmount = Math.round(oldAmount * qty);
  updates.push({ id: charge.id, code: charge.code, qty, oldAmount, newAmount, note: charge.note });
}

for (const u of updates) {
  console.log(
    `  ${u.code ?? u.id}  x${u.qty}  ${u.oldAmount.toLocaleString("es-CO")} -> ${u.newAmount.toLocaleString("es-CO")}`,
  );
}
console.log(`\nA actualizar: ${updates.length}  |  Sin cambio: ${skipped.length}`);

if (!APPLY) {
  console.log("\n[dry-run] No se aplico ningun cambio. Revisa la lista y vuelve a correr con --apply.");
} else if (updates.length > 0) {
  let done = 0;
  for (const u of updates) {
    await prisma.supplierLedgerEntry.update({
      where: { id: u.id },
      data: { amount: u.newAmount },
    });
    done += 1;
  }
  console.log(`\nCargos actualizados: ${done}`);
} else {
  console.log("\nNada que actualizar.");
}

await prisma.$disconnect();
