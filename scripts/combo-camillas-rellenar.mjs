// Relleno del Combo Camillas: crea la orden de Laura en ventas viejas del combo que quedaron
// sin orden (SAL-00081 y SAL-00082), con la MISMA logica que la app al registrar la venta
// (crearOrdenCombo, la que usa autoCreateComboOrder).
//
// POR DEFECTO ES SIMULACION: muestra los items de la cotizacion de cada venta, si ya tiene orden,
// la Laura y el costo encontrados y que se haria. No escribe nada.
// Con --aplicar crea la orden una vez por venta y solo si planComboOrder dice "crear". Si la
// venta no trae productos, no se inventa nada: queda con la alerta "Falta el producto" en
// /admin/ventas para que la oficina cargue el producto. Nunca le escribe a Laura.
// Ojo antes de --aplicar: crear la orden carga el costo del combo a la venta (baja la ganancia en
// Balances y la comision del mes de quien la vendio) y crea el cargo en la cuenta de Laura.
// Revisar la simulacion con Alexander.
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run combo:rellenar                  # simulacion
//   npm run combo:rellenar -- --aplicar     # escribe (pedir aprobacion antes)
// Corre con vite-node y scripts/vite-node.config.mjs (alias "@/" y "server-only").

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getComboCamillasSupplierId } from "../src/lib/system-settings";
import { parseQuoteItemMeta } from "../src/lib/quote-item-meta";
import { ORDEN_COMBO_CREADA_SOLA } from "../src/modules/ventas/domain/combo-camillas";
import { crearOrdenCombo, planearOrdenCombo } from "../src/modules/ventas/application/crear-orden-combo";

const VENTAS = ["SAL-00081", "SAL-00082"];

const MOTIVOS = {
  falta_producto: "la cotizacion no trae productos",
  falta_proveedora: "no hay una proveedora Laura",
  proveedora_ambigua: "hay mas de una proveedora Laura",
  falta_costo: "Laura no tiene costo cargado para el combo",
};

const pesos = (valor) => `$${Math.round(Number(valor)).toLocaleString("es-CO")}`;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL (en el entorno o en .env).");
    process.exitCode = 1;
    return;
  }
  console.log(`${aplicar ? "APLICANDO" : "SIMULACION (no se escribe nada)"} · ventas: ${VENTAS.join(", ")}\n`);

  // Actor de las ordenes creadas por el script: el ADMIN mas antiguo (como los gastos por Claude).
  const actor = aplicar
    ? await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } })
    : null;
  if (aplicar && !actor) {
    console.error("No hay un usuario ADMIN para firmar las ordenes. No se hizo nada.");
    process.exitCode = 1;
    return;
  }
  const configSupplierId = await getComboCamillasSupplierId();

  for (const code of VENTAS) {
    const sale = await prisma.sale.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        status: true,
        total: true,
        quote: {
          select: {
            code: true,
            createdBy: { select: { name: true, email: true } },
            items: { select: { quantity: true, notes: true, product: { select: { code: true, name: true } } } },
          },
        },
        order: {
          select: {
            code: true,
            status: true,
            items: {
              select: {
                quantity: true,
                purchaseCost: true,
                product: { select: { code: true, name: true } },
                confirmedSupplier: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!sale) {
      console.log(`${code}: no existe. Se omite.\n`);
      continue;
    }

    const vendedora = sale.quote.createdBy?.name || sale.quote.createdBy?.email || "sin dato";
    console.log(`${sale.code} (${sale.quote.code}) · ${sale.status} · total ${pesos(sale.total)} · vendedora: ${vendedora}`);
    console.log(`  Items de la cotizacion (${sale.quote.items.length}):`);
    if (sale.quote.items.length === 0) console.log("    (ninguno)");
    for (const item of sale.quote.items) {
      const meta = parseQuoteItemMeta(item.notes);
      const combo = meta.comboCode ? ` · del combo ${meta.comboCode}` : "";
      console.log(`    ${item.quantity} x ${item.product.name} (${item.product.code ?? "sin codigo"})${combo}`);
    }
    if (sale.order) {
      console.log(`  Ya tiene orden ${sale.order.code} (${sale.order.status}):`);
      for (const item of sale.order.items) {
        const costo = item.purchaseCost == null ? "sin costo" : pesos(item.purchaseCost);
        console.log(`    ${item.quantity} x ${item.product.name} · ${item.confirmedSupplier?.name ?? "sin proveedora"} · ${costo}`);
      }
    } else {
      console.log("  Sin orden.");
    }

    if (sale.status === "CANCELLED") {
      console.log("  -> Venta cancelada: no se toca.\n");
      continue;
    }

    const planeado = await planearOrdenCombo(prisma, sale.id, configSupplierId);
    if (!planeado) {
      console.log("  -> No se pudo leer la venta. Se omite.\n");
      continue;
    }
    const lauras = planeado.proveedoras.map((p) => p.name).join(", ") || "ninguna";
    console.log(`  Laura encontrada: ${lauras} · costo por combo: ${planeado.costo == null ? "sin dato" : pesos(planeado.costo)}`);

    const { plan } = planeado;
    if (plan.accion === "nada") {
      console.log(`  -> Nada que hacer: ${planeado.yaTieneOrden ? "ya tiene orden" : "no trae el Combo Camillas"}.\n`);
      continue;
    }
    if (plan.accion === "alerta") {
      console.log(`  -> No se crea: ${MOTIVOS[plan.motivo] ?? plan.motivo}. Queda con la alerta "Falta el producto" en /admin/ventas para que la oficina lo resuelva.\n`);
      continue;
    }

    console.log(
      `  -> Se crearia la orden con ${lauras}: ${plan.combos} combo(s) x ${pesos(plan.unitCost)} = ${pesos(plan.unitCost * plan.combos)} de costo y cargo en su cuenta.`,
    );
    console.log(`     Cambia la ganancia de la venta en Balances y la comision de ${vendedora} del mes en que se pago.`);
    if (!aplicar) {
      console.log("");
      continue;
    }

    const result = await crearOrdenCombo(sale.id, actor.id);
    if (!result.creada) {
      console.log(`  -> No se creo (${result.motivo}).\n`);
      continue;
    }
    // Misma bitacora que la app, asi la orden muestra "Orden creada sola para Laura".
    await prisma.activityLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name?.trim() || actor.email?.trim() || "Desconocido",
        action: "CREATE",
        entityType: "ORDER",
        entityId: result.orderId,
        summary: `${ORDEN_COMBO_CREADA_SOLA}: ${result.orderCode} (relleno)`,
      },
    });
    console.log(`  -> CREADA ${result.orderCode}. El link para Laura esta en la orden; no se le mando nada.\n`);
  }
}

main()
  .catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
