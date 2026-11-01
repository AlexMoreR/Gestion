import { logActivityAs } from "@/lib/activity-log";
import { getManufacturingPayments, isManufacturingItem } from "@/lib/manufacturing-orders";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { removeSupplierPaymentReceipt, saveSupplierPaymentReceiptBytes } from "@/lib/supplier-payment-receipt";
import type { AccountOption } from "@/modules/expenses/domain/expense-draft";
import { isLikelyDuplicate, type OfBalance } from "../domain/supplier-payment";
import {
  SupplierPaymentDraftUsedError,
  SupplierPaymentDuplicateError,
  type OfInfo,
  type SupplierPaymentDeps,
} from "../application/register-supplier-payment-by-voice";

const RECENT_WINDOW_MS = 24 * 60 * 60_000;

async function balanceOf(of: OfInfo): Promise<OfBalance> {
  // Costo de la OF cuando aun no hay cargos: subtotales de sus productos (igual que la pantalla de la orden).
  const items = await prisma.orderItem.findMany({
    where: { orderId: of.orderId, confirmedSupplierId: of.supplier.id },
    select: { confirmedSupplierId: true, fulfillmentMode: true, purchaseCost: true, quantity: true },
  });
  const subtotals = items
    .filter(isManufacturingItem)
    .map((item) => (item.purchaseCost == null ? null : Number(item.purchaseCost) * item.quantity));
  const summary = (
    await getManufacturingPayments(of.orderId, [of.supplier.id], new Map([[of.supplier.id, subtotals]]))
  ).get(of.supplier.id);
  return summary ?? { costo: null, pagado: 0, falta: null, costoConfirmado: false };
}

// Une los puertos de "registrar pago a la proveedora por voz/chat" con Prisma.
export function createPrismaSupplierPaymentDeps(): SupplierPaymentDeps {
  return {
    async findOfByCode(code) {
      const found = await prisma.manufacturingOrder.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          orderId: true,
          supplier: { select: { id: true, name: true } },
          order: { select: { status: true, saleId: true, sale: { select: { code: true, paymentMethod: true } } } },
        },
      });
      if (!found) return null;
      return {
        id: found.id,
        code: found.code,
        orderId: found.orderId,
        orderStatus: found.order.status,
        saleId: found.order.saleId,
        saleCode: found.order.sale?.code ?? null,
        paymentMethod: found.order.sale?.paymentMethod ?? null,
        supplier: found.supplier,
      };
    },

    async listAccounts() {
      // La cuenta del dueno (OWNER) solo se usa en Gastos.
      const accounts = await prisma.account.findMany({
        where: { isActive: true, type: { not: "OWNER" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true },
      });
      return accounts as AccountOption[];
    },

    getBalance: balanceOf,

    async recentPayments(of) {
      const entries = await prisma.supplierLedgerEntry.findMany({
        where: {
          orderId: of.orderId,
          supplierId: of.supplier.id,
          type: "PAYMENT",
          createdAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
        },
        select: { amount: true, paymentDate: true, createdAt: true },
      });
      return entries.map((entry) => ({
        ofId: of.id,
        monto: Number(entry.amount),
        fecha: entry.paymentDate ?? entry.createdAt,
        creadoEn: entry.createdAt,
      }));
    },

    async createPayment(of, input, nuevo) {
      return prisma.$transaction(async (tx) => {
        // Candado por OF: dos confirmaciones al mismo tiempo no crean dos pagos.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pago-proveedora:${of.id}`}))`;
        const recent = await tx.supplierLedgerEntry.findMany({
          where: {
            orderId: input.orderId,
            supplierId: input.supplierId,
            type: "PAYMENT",
            createdAt: { gte: new Date(nuevo.creadoEn.getTime() - RECENT_WINDOW_MS) },
          },
          select: { amount: true, paymentDate: true, createdAt: true },
        });
        const recientes = recent.map((entry) => ({
          ofId: of.id,
          monto: Number(entry.amount),
          fecha: entry.paymentDate ?? entry.createdAt,
          creadoEn: entry.createdAt,
        }));
        if (isLikelyDuplicate(nuevo, recientes)) {
          throw new SupplierPaymentDuplicateError();
        }
        const entry = await tx.supplierLedgerEntry.create({
          data: {
            supplierId: input.supplierId,
            type: "PAYMENT",
            amount: input.amount,
            orderId: input.orderId,
            saleId: input.saleId,
            accountId: input.accountId,
            paymentDate: input.paymentDate,
            note: input.note,
            receiptUrl: null,
            createdById: input.createdById,
          },
          select: { id: true },
        });
        await tx.pagoProveedoraBorrador.create({
          data: { tokenHash: input.receiptDraft.tokenHash, ledgerEntryId: entry.id, expiraEn: input.receiptDraft.expiraEn },
        });
        return entry;
      });
    },

    async markItemsPaidIfSettled(of) {
      const balance = await balanceOf(of);
      if (balance.costoConfirmado && balance.falta === 0) {
        await prisma.orderItem.updateMany({
          where: { orderId: of.orderId, confirmedSupplierId: of.supplier.id },
          data: { supplierPaymentStatus: "PAID" },
        });
      }
      return balance;
    },

    // La conexion del MCP no sabe quien habla: igual que en gastos, queda a nombre del dueno.
    async resolveActor() {
      const email = process.env.MCP_GASTOS_USUARIO_EMAIL?.trim().toLowerCase();
      const select = { id: true, name: true, email: true } as const;
      if (email) {
        const configured = await prisma.user.findFirst({ where: { email }, select });
        if (configured) return configured;
      }
      return prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select });
    },

    siteUrl: (path) => getSiteUrl(path),

    async findDraftByTokenHash(hash) {
      const draft = await prisma.pagoProveedoraBorrador.findUnique({
        where: { tokenHash: hash },
        select: {
          id: true,
          ledgerEntryId: true,
          expiraEn: true,
          usadoEn: true,
          ledgerEntry: {
            select: { amount: true, paymentDate: true, orderId: true, supplierId: true, supplier: { select: { name: true } } },
          },
        },
      });
      if (!draft) return null;
      const { ledgerEntry } = draft;
      const of = ledgerEntry.orderId
        ? await prisma.manufacturingOrder.findUnique({
            where: { orderId_supplierId: { orderId: ledgerEntry.orderId, supplierId: ledgerEntry.supplierId } },
            select: { code: true },
          })
        : null;
      return {
        id: draft.id,
        ledgerEntryId: draft.ledgerEntryId,
        expiraEn: draft.expiraEn,
        usadoEn: draft.usadoEn,
        ofCode: of?.code ?? null,
        supplierName: ledgerEntry.supplier.name,
        amount: Number(ledgerEntry.amount),
        paymentDate: ledgerEntry.paymentDate,
      };
    },

    async attachReceipt(draftId, receipt) {
      await prisma.$transaction(async (tx) => {
        // Candado de la fila: un doble envio espera aqui y luego lo ve usado.
        const locked = await tx.$queryRaw<Array<{ usadoEn: Date | null; expiraEn: Date }>>`
          SELECT "usadoEn", "expiraEn" FROM "PagoProveedoraBorrador" WHERE "id" = ${draftId} FOR UPDATE`;
        const row = locked[0];
        if (!row || row.usadoEn || row.expiraEn.getTime() <= Date.now()) {
          throw new SupplierPaymentDraftUsedError();
        }
        await tx.supplierLedgerEntry.update({
          where: { id: receipt.ledgerEntryId },
          data: { receiptUrl: receipt.url, receiptName: receipt.name },
        });
        await tx.pagoProveedoraBorrador.update({ where: { id: draftId }, data: { usadoEn: new Date() } });
      });
    },

    receiptStore: {
      save: (file) => saveSupplierPaymentReceiptBytes(file.bytes, file.name, file.ext),
      remove: removeSupplierPaymentReceipt,
    },

    logActivity: (actor, entry) =>
      logActivityAs(actor, { action: "CREATE", entityType: "SUPPLIER", entityId: entry.entryId, summary: entry.summary }),
  };
}
