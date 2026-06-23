// Consolida los "Consumidor final" desechables (mostrador-*@magilus.local) en un
// unico cliente generico (consumidor-final@magilus.local).
//
// Uso:
//   node --env-file=.env scripts/consolidate-consumidor-final.mjs          (dry-run, solo cuenta)
//   node --env-file=.env scripts/consolidate-consumidor-final.mjs --apply  (aplica los cambios)

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const SINGLETON_EMAIL = "consumidor-final@magilus.local";
const APPLY = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const dupes = await prisma.user.findMany({
    where: {
      role: "CLIENTE",
      email: { startsWith: "mostrador-", endsWith: "@magilus.local" },
    },
    select: {
      id: true,
      _count: { select: { quotesAsClient: true, ordersAsClient: true, salesAsClient: true } },
    },
  });

  const totalQuotes = dupes.reduce((acc, d) => acc + d._count.quotesAsClient, 0);
  const totalOrders = dupes.reduce((acc, d) => acc + d._count.ordersAsClient, 0);
  const totalSales = dupes.reduce((acc, d) => acc + d._count.salesAsClient, 0);

  console.log(`Registros "Consumidor final" desechables encontrados: ${dupes.length}`);
  console.log(`  Cotizaciones asociadas: ${totalQuotes}`);
  console.log(`  Ventas asociadas:       ${totalSales}`);
  console.log(`  Ordenes asociadas:      ${totalOrders}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: no se modifico nada. Ejecuta con --apply para consolidar.");
    return;
  }

  if (dupes.length === 0) {
    console.log("\nNada que consolidar.");
    return;
  }

  const dupeIds = dupes.map((d) => d.id);

  await prisma.$transaction(async (tx) => {
    const singleton = await tx.user.upsert({
      where: { email: SINGLETON_EMAIL },
      update: {},
      create: {
        name: "Consumidor final",
        email: SINGLETON_EMAIL,
        role: "CLIENTE",
        password: await bcrypt.hash(randomUUID().replace(/-/g, "").slice(0, 14), 12),
      },
      select: { id: true },
    });

    // El singleton podria estar dentro de la lista si ya existia con otro patron; lo excluimos.
    const idsToMove = dupeIds.filter((id) => id !== singleton.id);
    if (idsToMove.length === 0) {
      console.log("\nNada que mover.");
      return;
    }

    await tx.quote.updateMany({
      where: { clientId: { in: idsToMove } },
      data: { clientId: singleton.id },
    });
    await tx.sale.updateMany({
      where: { clientId: { in: idsToMove } },
      data: { clientId: singleton.id },
    });
    await tx.order.updateMany({
      where: { clientId: { in: idsToMove } },
      data: { clientId: singleton.id },
    });

    const deleted = await tx.user.deleteMany({ where: { id: { in: idsToMove } } });
    console.log(`\nConsolidado en ${SINGLETON_EMAIL}. Clientes desechables eliminados: ${deleted.count}`);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
