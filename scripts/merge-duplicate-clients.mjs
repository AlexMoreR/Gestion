// Fusiona clientes (User role CLIENTE) duplicados que corresponden a la misma
// persona. Criterio: mismo documento; si no hay documento, mismo telefono.
// Reasigna cotizaciones, ventas y ordenes al cliente primario y borra el resto.
//
// El primario se elige asi: 1) el que tenga correo real, 2) el que tenga mas
// registros asociados, 3) el mas antiguo.
//
// Uso:
//   node --env-file=.env scripts/merge-duplicate-clients.mjs          (dry-run, solo reporta)
//   node --env-file=.env scripts/merge-duplicate-clients.mjs --apply  (aplica los cambios)

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const normDoc = (value) => (value ?? "").trim();
const normPhone = (value) => (value ?? "").replace(/\D/g, "");
// Correos desechables generados por el sistema (no son identidad real).
const isPlaceholderEmail = (email) => !email || /@(sin-correo|magilus)\.local$/i.test(email);
const relationCount = (c) =>
  c._count.quotesAsClient + c._count.salesAsClient + c._count.ordersAsClient;

async function main() {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENTE" },
    select: {
      id: true,
      name: true,
      email: true,
      document: true,
      phone: true,
      createdAt: true,
      _count: { select: { quotesAsClient: true, salesAsClient: true, ordersAsClient: true } },
    },
  });

  // Agrupa por documento (si existe) o por telefono normalizado.
  const groups = new Map();
  for (const client of clients) {
    const doc = normDoc(client.document);
    const phone = normPhone(client.phone);
    const key = doc ? `doc:${doc}` : phone ? `phone:${phone}` : null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(client);
  }

  const dupeGroups = [...groups.entries()].filter(([, members]) => members.length > 1);

  if (dupeGroups.length === 0) {
    console.log("No se encontraron clientes duplicados.");
    return;
  }

  console.log(`Grupos de duplicados encontrados: ${dupeGroups.length}\n`);

  const plan = [];
  for (const [key, members] of dupeGroups) {
    // Ordena para elegir primario: correo real > mas relaciones > mas antiguo.
    const sorted = [...members].sort((a, b) => {
      const aReal = !isPlaceholderEmail(a.email);
      const bReal = !isPlaceholderEmail(b.email);
      if (aReal !== bReal) return aReal ? -1 : 1;
      const byRel = relationCount(b) - relationCount(a);
      if (byRel !== 0) return byRel;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const primary = sorted[0];
    const dupes = sorted.slice(1);
    plan.push({ key, primary, dupes });

    console.log(`• ${primary.name ?? "(sin nombre)"} [${key}]`);
    console.log(`   primario: ${primary.id} <${primary.email}> (${relationCount(primary)} registros)`);
    for (const d of dupes) {
      console.log(`   fusionar: ${d.id} <${d.email}> (${relationCount(d)} registros) -> borrar`);
    }
  }

  const totalToDelete = plan.reduce((acc, p) => acc + p.dupes.length, 0);
  console.log(`\nClientes a eliminar tras reasignar: ${totalToDelete}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: no se modifico nada. Ejecuta con --apply para fusionar.");
    return;
  }

  for (const { primary, dupes } of plan) {
    const dupeIds = dupes.map((d) => d.id);
    await prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({ where: { clientId: { in: dupeIds } }, data: { clientId: primary.id } });
      await tx.sale.updateMany({ where: { clientId: { in: dupeIds } }, data: { clientId: primary.id } });
      await tx.order.updateMany({ where: { clientId: { in: dupeIds } }, data: { clientId: primary.id } });

      // Si el primario quedo sin correo real pero algun duplicado tenia uno, se
      // conserva ese correo (los duplicados se borran y liberan la unicidad).
      if (isPlaceholderEmail(primary.email)) {
        const withRealEmail = dupes.find((d) => !isPlaceholderEmail(d.email));
        if (withRealEmail) {
          const profile = {
            email: withRealEmail.email,
            document: primary.document ?? withRealEmail.document ?? null,
          };
          await tx.user.deleteMany({ where: { id: { in: dupeIds } } });
          await tx.user.update({ where: { id: primary.id }, data: profile });
          return;
        }
      }

      await tx.user.deleteMany({ where: { id: { in: dupeIds } } });
    });
  }

  console.log(`\nListo. Clientes duplicados eliminados: ${totalToDelete}`);
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
