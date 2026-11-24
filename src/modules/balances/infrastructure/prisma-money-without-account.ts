import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { UnaccountedRow } from "../domain/account-ledger";
import type { MoneyWithoutAccount } from "../domain/cash-position";
import { runFreightAutoLinkSafely } from "./prisma-freight-auto-link";

// Plata registrada sin decir de que cuenta entro o salio: no suma ni resta en ningun saldo,
// por eso el saldo de la app puede no cuadrar con el banco hasta que se le asigne cuenta.
// La retencion en la fuente no entra: nunca llega a una cuenta y eso es correcto.
// Los mismos filtros sirven para los conteos, la lista (listMoneyWithoutAccount) y el aviso diario.
export const SALE_PAYMENT_WITHOUT_ACCOUNT = { accountId: null, isWithholding: false } satisfies Prisma.SalePaymentWhereInput;
export const SUPPLIER_PAYMENT_WITHOUT_ACCOUNT = { accountId: null, type: "PAYMENT" } satisfies Prisma.SupplierLedgerEntryWhereInput;
// Un flete enlazado al pago al transportador ya resta del saldo por ese pago.
export const SHIPPING_COST_WITHOUT_ACCOUNT = { accountId: null, supplierPaymentId: null } satisfies Prisma.ShippingCostWhereInput;

export async function getMoneyWithoutAccount(): Promise<MoneyWithoutAccount> {
  // La primera vez une solos los fletes viejos con su pago en Proveedores (no cambia saldos).
  await runFreightAutoLinkSafely();
  const [salePayments, supplierPayments, shippingCosts] = await Promise.all([
    prisma.salePayment.aggregate({
      where: SALE_PAYMENT_WITHOUT_ACCOUNT,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.supplierLedgerEntry.aggregate({
      where: SUPPLIER_PAYMENT_WITHOUT_ACCOUNT,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.shippingCost.aggregate({
      where: SHIPPING_COST_WITHOUT_ACCOUNT,
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);
  const pick = (row: { _count: { _all: number }; _sum: { amount: unknown } }) => ({
    count: row._count._all,
    amount: Math.round(Number(row._sum.amount ?? 0)),
  });
  return {
    salePayments: pick(salePayments),
    supplierPayments: pick(supplierPayments),
    shippingCosts: pick(shippingCosts),
  };
}

const code = (value: string | null | undefined) => (value ? displayCode(value) : null);
const person = (user: { name: string | null; email: string } | null) => (user ? user.name || user.email : null);

/** SOLO LECTURA. Las mismas filas que cuenta getMoneyWithoutAccount, una por una (herramienta registros_sin_cuenta). */
export async function listMoneyWithoutAccount(): Promise<UnaccountedRow[]> {
  // Igual que los conteos: primero se unen los fletes viejos con su pago, para que cuadren.
  await runFreightAutoLinkSafely();
  const who = { select: { name: true, email: true } } as const;
  const [salePayments, supplierPayments, shippingCosts] = await Promise.all([
    prisma.salePayment.findMany({
      where: SALE_PAYMENT_WITHOUT_ACCOUNT,
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        createdBy: who,
        sale: { select: { code: true, client: who, order: { select: { code: true } } } },
      },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: SUPPLIER_PAYMENT_WITHOUT_ACCOUNT,
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        supplierId: true,
        createdBy: who,
        supplier: { select: { name: true } },
        sale: { select: { code: true } },
        order: { select: { code: true, manufacturingOrders: { select: { code: true, supplierId: true } } } },
        dispatch: { select: { code: true } },
      },
    }),
    prisma.shippingCost.findMany({
      where: SHIPPING_COST_WITHOUT_ACCOUNT,
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        shippingProvider: true,
        createdBy: who,
        sale: { select: { code: true, order: { select: { code: true } } } },
      },
    }),
  ]);

  return [
    ...salePayments.map((row) => ({
      tipo: "abono" as const,
      fecha: row.paymentDate ?? row.createdAt,
      registradoEn: row.createdAt,
      quien: person(row.sale.client),
      venta: code(row.sale.code),
      orden: code(row.sale.order?.code),
      of: null,
      despacho: null,
      registradoPor: person(row.createdBy),
      valor: Number(row.amount),
    })),
    ...supplierPayments.map((row) => ({
      tipo: "pago_proveedora" as const,
      fecha: row.paymentDate ?? row.createdAt,
      registradoEn: row.createdAt,
      quien: row.supplier.name,
      venta: code(row.sale?.code),
      orden: code(row.order?.code),
      of: code(row.order?.manufacturingOrders.find((of) => of.supplierId === row.supplierId)?.code),
      despacho: code(row.dispatch?.code),
      registradoPor: person(row.createdBy),
      valor: Number(row.amount),
    })),
    ...shippingCosts.map((row) => ({
      tipo: "flete" as const,
      fecha: row.paymentDate,
      registradoEn: row.createdAt,
      quien: row.shippingProvider || null,
      venta: code(row.sale.code),
      orden: code(row.sale.order?.code),
      of: null,
      despacho: null,
      registradoPor: person(row.createdBy),
      valor: Number(row.amount),
    })),
  ];
}
