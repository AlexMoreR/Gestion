import { prisma } from "@/lib/prisma";
import type { UnaccountedRecord } from "../domain/money-alert";

// Lo guardado SIN cuenta desde `since` (por createdAt = momento real del registro). Mismo criterio
// que la "plata sin cuenta" de Balances (getMoneyWithoutAccount), pero con la venta o la proveedora.
// Solo lectura. La retencion en la fuente se trae marcada y la descarta la regla (buildMoneyAlert).
export async function listUnaccountedSince(since: Date): Promise<UnaccountedRecord[]> {
  const [salePayments, shippingCosts, supplierPayments] = await Promise.all([
    prisma.salePayment.findMany({
      where: { accountId: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { amount: true, isWithholding: true, sale: { select: { code: true } } },
    }),
    // Un flete enlazado al pago al transportador ya resta del saldo por ese pago.
    prisma.shippingCost.findMany({
      where: { accountId: null, supplierPaymentId: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { amount: true, sale: { select: { code: true } } },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { accountId: null, type: "PAYMENT", createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { amount: true, supplier: { select: { name: true } } },
    }),
  ]);

  return [
    ...shippingCosts.map((row) => ({ kind: "flete" as const, ref: row.sale.code, amount: Number(row.amount) })),
    ...salePayments.map((row) => ({
      kind: "abono" as const,
      ref: row.sale.code,
      amount: Number(row.amount),
      isWithholding: row.isWithholding,
    })),
    ...supplierPayments.map((row) => ({
      kind: "pago_proveedor" as const,
      ref: row.supplier.name,
      amount: Number(row.amount),
    })),
  ];
}
