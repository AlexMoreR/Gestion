// Corrige ventas historicas que quedaron en ACTIVE pese a estar pagadas al 100%.
// Replica la regla de negocio: si downPaymentAmount >= total, la venta esta facturada.
// Idempotente: solo afecta ventas ACTIVE totalmente pagadas.
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

const DRY_RUN = process.argv.includes("--dry-run");

const candidates = await prisma.$queryRaw`
  SELECT "id", "code", "total", "downPaymentAmount"
  FROM "Sale"
  WHERE "status" = 'ACTIVE'
    AND "downPaymentAmount" >= "total"
  ORDER BY "code"
`;

console.log(`Ventas ACTIVE totalmente pagadas encontradas: ${candidates.length}`);
for (const sale of candidates) {
  console.log(`  - ${sale.code}: total=${sale.total} abonado=${sale.downPaymentAmount}`);
}

if (DRY_RUN) {
  console.log("\n[dry-run] No se aplico ningun cambio.");
} else if (candidates.length > 0) {
  const result = await prisma.sale.updateMany({
    where: { id: { in: candidates.map((s) => s.id) }, status: "ACTIVE" },
    data: { status: "INVOICED" },
  });
  console.log(`\nVentas actualizadas a INVOICED: ${result.count}`);
} else {
  console.log("\nNada que actualizar.");
}

await prisma.$disconnect();
