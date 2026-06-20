import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
const p = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });
const sup = await p.supplier.findUnique({ where: { shareToken: "53594957-68ad-4373-bb96-e3fdc5b67a21" }, select: { id: true } });
const charges = await p.supplierLedgerEntry.findMany({
  where: { supplierId: sup.id, type: "CHARGE", orderId: null },
  select: {
    id: true, note: true, inventoryMovementId: true,
    inventoryMovement: { select: { id: true, productId: true, product: { select: { name: true, code: true, thumbnailUrl: true } } } },
  },
});
for (const c of charges) {
  console.log(`note="${c.note}" | movId=${c.inventoryMovementId} | prod=${JSON.stringify(c.inventoryMovement?.product ?? null)}`);
}
await p.$disconnect();
