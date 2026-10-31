import { prisma } from "@/lib/prisma";
import { planFreightAutoLink } from "../domain/freight-without-account";

// Cruce automatico de fletes viejos sin cuenta con su pago en Proveedores (decision del dueno,
// 30-oct-2026). Corre UNA sola vez: marca en AppSetting y candado de Postgres para que dos
// pestanas no lo corran a la vez. No mueve saldos (el pago ya restaba de su cuenta): solo llena
// ShippingCost.supplierPaymentId, igual que el boton "Ya esta pagado en Proveedores", y deja
// cada cruce en la bitacora con el id del flete y el del pago para poder deshacerlo.
export const FREIGHT_AUTO_LINK_KEY = "freightAutoLinkDone";
const FREIGHT_AUTO_LINK_LOCK = "freightAutoLink";

export type FreightAutoLinkResult = { at: string; linked: number; amount: number };

function parseResult(value: string): FreightAutoLinkResult | null {
  try {
    const parsed = JSON.parse(value) as Partial<FreightAutoLinkResult>;
    return { at: String(parsed.at ?? ""), linked: Number(parsed.linked ?? 0), amount: Number(parsed.amount ?? 0) };
  } catch {
    return null;
  }
}

async function readDone(): Promise<FreightAutoLinkResult | null | undefined> {
  const row = await prisma.appSetting.findUnique({ where: { key: FREIGHT_AUTO_LINK_KEY }, select: { value: true } });
  return row ? parseResult(row.value) : undefined;
}

/** Corre el cruce si nunca corrio y devuelve su resultado (o el de la primera vez). */
async function runFreightAutoLinkOnce(): Promise<FreightAutoLinkResult | null> {
  const done = await readDone();
  if (done !== undefined) return done;

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FREIGHT_AUTO_LINK_LOCK}))`;
      const again = await tx.appSetting.findUnique({ where: { key: FREIGHT_AUTO_LINK_KEY }, select: { value: true } });
      if (again) return parseResult(again.value);

      const [freights, payments] = await Promise.all([
        tx.shippingCost.findMany({
          where: { accountId: null, supplierPaymentId: null },
          select: {
            id: true,
            saleId: true,
            shippingProvider: true,
            amount: true,
            paymentDate: true,
            sale: { select: { code: true, order: { select: { id: true } } } },
          },
        }),
        tx.supplierLedgerEntry.findMany({
          where: { type: "PAYMENT", accountId: { not: null }, shippingCosts: { none: {} } },
          select: {
            id: true,
            saleId: true,
            orderId: true,
            amount: true,
            paymentDate: true,
            createdAt: true,
            accountId: true,
            order: { select: { saleId: true } },
            supplier: { select: { name: true, type: true } },
          },
        }),
      ]);

      const links = planFreightAutoLink(
        freights.map((row) => ({
          id: row.id,
          saleId: row.saleId,
          orderId: row.sale.order?.id ?? null,
          shippingProvider: row.shippingProvider,
          amount: Number(row.amount),
          date: row.paymentDate,
        })),
        payments.map((row) => ({
          id: row.id,
          saleId: row.saleId ?? row.order?.saleId ?? null,
          orderId: row.orderId,
          supplierName: row.supplier.name,
          isCarrier: row.supplier.type === "SHIPPING",
          hasAccount: row.accountId !== null,
          amount: Number(row.amount),
          date: row.paymentDate ?? row.createdAt,
        })),
      );

      const freightById = new Map(freights.map((row) => [row.id, row]));
      const paymentById = new Map(payments.map((row) => [row.id, row]));
      let linked = 0;
      let amount = 0;
      for (const link of links) {
        const updated = await tx.shippingCost.updateMany({
          where: { id: link.freightId, accountId: null, supplierPaymentId: null },
          data: { supplierPaymentId: link.paymentId },
        });
        if (updated.count === 0) continue;
        const freight = freightById.get(link.freightId)!;
        const payment = paymentById.get(link.paymentId)!;
        const money = Math.round(Number(freight.amount));
        linked += 1;
        amount += money;
        await tx.activityLog.create({
          data: {
            actorId: null,
            actorName: "Gestión (cruce automático)",
            action: "UPDATE",
            entityType: "SHIPMENT",
            entityId: freight.id,
            summary: `Cruce automático (regla ${link.rule}): flete ${freight.id} de ${freight.shippingProvider} por $${money.toLocaleString("es-CO")} (venta ${freight.sale.code}) unido al pago ${payment.id} a ${payment.supplier.name}. Para deshacer: dejar supplierPaymentId vacío en ese flete.`,
          },
        });
      }

      const result: FreightAutoLinkResult = { at: new Date().toISOString(), linked, amount };
      await tx.appSetting.create({ data: { key: FREIGHT_AUTO_LINK_KEY, value: JSON.stringify(result) } });
      return result;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Igual que runFreightAutoLinkOnce, pero si falla no rompe la pagina: se reintenta en la proxima carga. */
export async function runFreightAutoLinkSafely(): Promise<FreightAutoLinkResult | null> {
  try {
    return await runFreightAutoLinkOnce();
  } catch (error) {
    console.error("[fletes] el cruce automatico fallo; se reintenta en la proxima carga", error);
    return null;
  }
}
