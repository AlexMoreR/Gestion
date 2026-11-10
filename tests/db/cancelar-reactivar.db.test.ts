import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion } from "./helpers";

// Cancelar y reactivar una orden de venta (parte 2): el stock queda como antes de cancelar, la orden vuelve a su
// estado, y mientras está cancelada no se despacha. Mismo patrón que devoluciones-sin-plata.db.test.ts.
vi.mock("@/auth", () => ({ auth: async () => (sesion.user ? { user: sesion.user } : null) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redireccion(url);
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
process.env.RECIBO_CAJA_AVISO = "off";

const { prisma } = await import("@/lib/prisma");
const quotes = await import("@/app/actions/quote-actions");
const sales = await import("@/app/actions/sales-actions");
const orders = await import("@/app/actions/orders-actions");
const items = await import("@/app/actions/order-item-actions");
const dispatches = await import("@/app/actions/dispatch-actions");
const { ORDER_CANCELLED_BLOCK } = await import("@/lib/order-cancellation");
const { sumarDias } = await import("@/lib/delivery-tracking");
const { todayInColombia } = await import("@/lib/colombia-time");

let datos: Awaited<ReturnType<typeof sembrar>>;
let orden: { id: string; code: string; itemId: string; saleId: string };

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

async function stock(): Promise<number> {
  const { _sum } = await prisma.inventoryMovement.aggregate({ where: { productId: datos.producto.id }, _sum: { change: true } });
  return _sum.change ?? 0;
}

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

const cancelar = () => llamar(orders.adminCancelOrderAction, { orderId: orden.id, cancelReason: "ERROR_AL_CARGAR" });
const reactivar = (motivo: string, orderId = orden.id) =>
  llamar(orders.adminReactivateOrderAction, { orderId, reactivateReason: motivo });

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  await prisma.inventoryMovement.create({
    data: { productId: datos.producto.id, type: "IN", change: 10, note: "Stock inicial de la prueba", createdById: datos.admin.id },
  });
  sinError(
    await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: "Clienta Stock",
      email: "clientastock@prueba.local",
      phone: "3000000000",
      address: "Calle 10 # 20-30",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: [{ productId: datos.producto.id, supplierId: datos.proveedora.id, quantity: 2, unitPrice: 300_000, fulfillmentMode: "STOCK" }],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: "600000",
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    }),
  );
  const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
  sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: sale.id }));
  const order = await prisma.order.findFirstOrThrow({ where: { saleId: sale.id }, include: { items: true } });
  orden = { id: order.id, code: order.code, itemId: order.items[0].id, saleId: sale.id };
  sinError(await llamar(items.adminConfirmStockOrderItemAction, { orderItemId: orden.itemId }));
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("cancelar y reactivar una orden de venta", () => {
  let stockAntes = 0;
  let estadoAntes = "";

  it("cancelar repone el stock de la pieza confirmada", async () => {
    stockAntes = await stock();
    expect(stockAntes).toBe(8);
    estadoAntes = (await prisma.order.findUniqueOrThrow({ where: { id: orden.id } })).status;
    sinError(await cancelar());
    expect(await stock()).toBe(10);
  });

  it("un motivo de 2 letras se rechaza y no cambia nada", async () => {
    const r = await reactivar("no");
    expect(r.error).toMatch(/mínimo 3/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orden.id } })).status).toBe("CANCELLED");
    expect(await stock()).toBe(10);
  });

  it("reactivar vuelve al estado anterior y deja el stock como antes de cancelar", async () => {
    const pagos = await prisma.salePayment.count();
    sinError(await reactivar("Se equivocó"));
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orden.id } });
    expect(order.status).toBe(estadoAntes);
    expect(await stock()).toBe(stockAntes);
    const salida = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: datos.producto.id, note: `Reactivación de orden ${orden.code}` },
    });
    expect(salida.type).toBe("OUT");
    expect(salida.change).toBe(-2);
    const historial = await prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: orden.id }, orderBy: { createdAt: "desc" } });
    expect([historial.fromStatus, historial.toStatus]).toEqual(["CANCELLED", estadoAntes]);
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entityId: orden.id }, orderBy: { createdAt: "desc" } });
    expect(log.summary).toContain("Reactivó la orden");
    expect(log.summary).toContain("Motivo: Se equivocó");
    // La venta y sus abonos no cambian.
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: orden.saleId } })).status).not.toBe("CANCELLED");
    expect(await prisma.salePayment.count()).toBe(pagos);
  });

  it("una orden que no está cancelada no se reactiva", async () => {
    const r = await reactivar("Otra vez");
    expect(r.error).toBeTruthy();
    expect(await stock()).toBe(stockAntes);
  });

  it("cancelada otra vez, despachar se rechaza con el mensaje nuevo", async () => {
    sinError(await cancelar());
    expect(await stock()).toBe(10);
    const r = await llamar(dispatches.adminDispatchOrderItemAction, {
      orderId: orden.id,
      orderItemId: orden.itemId,
      deliveryType: "SHIPPING",
      carrierSupplierId: datos.transportadora.id,
      shippingCost: "20000",
      trackingNumber: "GUIA-1",
      shippingAddress: "Calle 1 # 2-3",
      accountId: datos.cuenta.id,
      shippingReceipt: comprobante("flete.png"),
      estimatedDeliveryAt: `${sumarDias(todayInColombia(), 3)}T19:00`,
      embalajeAbierto: comprobante("abierto.png"),
      embalajeCerrado: comprobante("cerrado.png"),
    });
    expect(r.error).toBe(ORDER_CANCELLED_BLOCK);
    expect(await prisma.dispatch.count({ where: { orderId: orden.id } })).toBe(0);
  });

  it("reactivar de nuevo saca solo lo de la última cancelación", async () => {
    sinError(await reactivar("Sí la quiere"));
    expect(await stock()).toBe(stockAntes);
  });

  it("con la venta cancelada no se reactiva", async () => {
    sinError(await cancelar());
    await prisma.sale.update({ where: { id: orden.saleId }, data: { status: "CANCELLED" } });
    const r = await reactivar("Se equivocó");
    expect(r.error).toMatch(/venta está cancelada/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orden.id } })).status).toBe("CANCELLED");
    expect(await stock()).toBe(10);
  });
});
