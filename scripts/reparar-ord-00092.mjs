// Reparacion de UNA SOLA VEZ (30-oct-2026): la ORD-00077 (compra COM-00010, Laura
// P-03, 2 combos, completada, con pago de 600.000) se perdio al editarla: la edicion
// de entonces borraba la orden y la creaba otra vez como ORD-00092 "liberada".
//
// Que hace:
//   1. Muestra la ORD-00092, sus pagos (no los toca), las entradas de inventario de
//      la COM-00010 y el stock de cada pieza.
//   2. Pasa la ORD-00092 a "Completada" con una linea en el historial.
//   3. Si a la COM-00010 le faltan unidades para lo que dice la orden, agrega UNA
//      entrada "Reposicion COM-00010" por producto, solo por lo que falta y SIN
//      cargo a la proveedora (el combo ya se le cargo).
//   4. Muestra lo que diga la bitacora sobre la 77 (despachos, flete); no lo recrea.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar. Se puede correr dos
// veces: si ya esta completada y sin faltantes, no hace nada.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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

const APLICAR = process.argv.includes("--aplicar");
const ORDEN = "ORD-00092";
const ORDEN_VIEJA = "ORD-00077";
const COMPRA = "COM-00010";
const NOTA = `Restaurada: era la ${ORDEN_VIEJA} (${COMPRA}), se perdió al editar`;

const order = await prisma.order.findUnique({
  where: { code: ORDEN },
  select: {
    id: true,
    type: true,
    status: true,
    purchaseCode: true,
    completedAt: true,
    items: { select: { productId: true, quantity: true, product: { select: { name: true } } } },
  },
});
if (!order) {
  console.error(`No existe la ${ORDEN}.`);
  process.exit(1);
}
if (order.type !== "PURCHASE" || order.purchaseCode !== COMPRA) {
  console.error(`La ${ORDEN} no es la compra ${COMPRA} (tipo ${order.type}, compra ${order.purchaseCode}). No se toca.`);
  process.exit(1);
}

console.log(`${ORDEN}: estado ${order.status}, completada ${order.completedAt?.toISOString() ?? "-"}`);

const payments = await prisma.supplierLedgerEntry.findMany({
  where: { type: "PAYMENT", OR: [{ orderId: order.id }, { orderItem: { orderId: order.id } }, { settlesEntry: { orderId: order.id } }] },
  select: { amount: true, paymentDate: true, supplier: { select: { name: true } } },
});
console.log(`Pagos (no se tocan): ${payments.length}`);
for (const p of payments) {
  console.log(`  - ${p.supplier.name}: ${Number(p.amount)} el ${p.paymentDate?.toISOString().slice(0, 10) ?? "-"}`);
}

const movements = await prisma.inventoryMovement.findMany({
  where: { purchaseCode: COMPRA },
  select: { productId: true, change: true, note: true, movementDate: true },
  orderBy: { createdAt: "asc" },
});
console.log(`\nEntradas de inventario de ${COMPRA}: ${movements.length}`);
for (const m of movements) {
  console.log(`  - ${m.productId}: ${m.change > 0 ? "+" : ""}${m.change} (${m.note ?? ""}) ${m.movementDate.toISOString().slice(0, 10)}`);
}

// Unidades que dice la orden vs. las que suman las entradas de la compra.
const ordered = new Map();
for (const item of order.items) {
  const prev = ordered.get(item.productId) ?? { name: item.product.name, units: 0 };
  ordered.set(item.productId, { name: prev.name, units: prev.units + item.quantity });
}
const faltantes = [];
console.log("\nStock por pieza:");
for (const [productId, { name, units }] of ordered) {
  const enCompra = movements.filter((m) => m.productId === productId).reduce((sum, m) => sum + m.change, 0);
  const stock = await prisma.inventoryMovement.aggregate({ where: { productId }, _sum: { change: true } });
  const falta = Math.max(0, units - enCompra);
  console.log(`  - ${name}: orden ${units}, entradas ${COMPRA} ${enCompra}, stock hoy ${stock._sum.change ?? 0}${falta ? `, FALTAN ${falta}` : ""}`);
  if (falta > 0) faltantes.push({ productId, name, falta });
}

// Bitacora de la 77: fecha en que se completo y rastros de despacho o flete.
const logs = await prisma.activityLog.findMany({
  where: { OR: [{ summary: { contains: ORDEN_VIEJA } }, { summary: { contains: COMPRA } }] },
  select: { createdAt: true, summary: true, actorName: true },
  orderBy: { createdAt: "asc" },
});
console.log(`\nBitácora sobre ${ORDEN_VIEJA} / ${COMPRA}: ${logs.length}`);
for (const log of logs) {
  console.log(`  - ${log.createdAt.toISOString()} ${log.actorName}: ${log.summary}`);
}
const completedLog = logs.filter((log) => log.summary.includes(ORDEN_VIEJA) && /COMPLETED|entreg|cerr/i.test(log.summary)).at(-1);
const completedAt = completedLog?.createdAt ?? new Date();
console.log(`\nFecha de completado a usar: ${completedAt.toISOString()} (${completedLog ? "de la bitácora" : "hoy: no hay rastro en la bitácora"})`);
console.log("Despachos o flete de la 77: solo se reportan arriba; no se recrean.");

const actor = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
if (!actor) {
  console.error("No hay un usuario ADMIN para firmar la reparación.");
  process.exit(1);
}

const cambiaEstado = order.status !== "COMPLETED";
console.log(`\nPlan: ${cambiaEstado ? `pasar ${ORDEN} a COMPLETED` : `${ORDEN} ya está completada`}; reposiciones: ${faltantes.length}`);
if (!APLICAR) {
  console.log("SIMULACIÓN: no se escribió nada. Usa --aplicar para escribir.");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  if (cambiaEstado) {
    await tx.order.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt } });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "COMPLETED", note: NOTA, changedById: actor.id },
    });
  }
  for (const f of faltantes) {
    await tx.inventoryMovement.create({
      data: {
        productId: f.productId,
        type: "IN",
        change: f.falta,
        note: `Reposición ${COMPRA}`,
        purchaseCode: COMPRA,
        movementDate: completedAt,
        createdById: actor.id,
      },
    });
  }
});
console.log("Listo: reparación aplicada.");
await prisma.$disconnect();
