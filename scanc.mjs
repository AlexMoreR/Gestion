import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const env = readFileSync(".env", "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL"))?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
const p = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const orders = await p.order.findMany({
  where: { type: "PURCHASE" },
  orderBy: { createdAt: "asc" },
  select: {
    code: true, status: true, purchaseCode: true, createdAt: true,
    items: { select: { quantity: true, product: { select: { code: true, isBundle: true } } } },
  },
});

console.log(`Órdenes de compra: ${orders.length}\n`);
for (const o of orders) {
  // Entradas IN ligadas a esta compra (por purchaseCode)
  const ins = o.purchaseCode
    ? await p.inventoryMovement.groupBy({
        by: ["productId"],
        where: { purchaseCode: o.purchaseCode, type: "IN" },
        _sum: { change: true },
      })
    : [];
  const totalIn = ins.reduce((s, r) => s + (r._sum.change ?? 0), 0);
  const itemsTxt = o.items.map((i) => `${i.product.code}${i.product.isBundle ? "(combo)" : ""} x${i.quantity}`).join(", ");
  console.log(`${o.code} [${o.status}] purchaseCode=${o.purchaseCode ?? "NULL"} created=${o.createdAt.toISOString().slice(0,10)}`);
  console.log(`   items: ${itemsTxt}`);
  console.log(`   movimientos IN ligados: ${ins.length} productos, total +${totalIn}`);
  if (!o.purchaseCode) console.log(`   ⚠️ SIN purchaseCode → no hay entradas de inventario ligadas`);
  else if (totalIn === 0) console.log(`   ⚠️ purchaseCode existe pero NO hay movimientos IN`);
  console.log("");
}
await p.$disconnect();
