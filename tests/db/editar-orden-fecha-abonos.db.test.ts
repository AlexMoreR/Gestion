import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion } from "./helpers";

// «Editar orden» (nov-2026, ORD-97): guardar el cuadro sin tocar la fecha ya no les pone la fecha de la
// orden a los abonos. Si la fecha cambia de verdad, se exige confirmarlo y entonces sí se mueven.
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
const { colombiaDayKey, todayInColombia } = await import("@/lib/colombia-time");
const { sumarDias } = await import("@/lib/delivery-tracking");
const { CONFIRMAR_FECHA_ABONOS_FIELD } = await import("@/lib/order-date-edit");

let datos: Awaited<ReturnType<typeof sembrar>>;
const ctx = { saleId: "", orderId: "", itemId: "" };

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

/** Todas las fechas que «Editar orden» podía mover. */
async function fechas() {
  const [orden, abonos, historial, cargos] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId }, include: { items: { orderBy: { id: "asc" } } } }),
    prisma.salePayment.findMany({ where: { saleId: ctx.saleId }, orderBy: { id: "asc" } }),
    prisma.orderStatusHistory.findMany({ where: { orderId: ctx.orderId }, orderBy: { id: "asc" } }),
    prisma.supplierLedgerEntry.findMany({ where: { orderId: ctx.orderId }, orderBy: { id: "asc" } }),
  ]);
  return {
    orden: [orden.createdAt.getTime(), orden.releasedAt?.getTime() ?? null],
    confirmados: orden.items.map((i) => i.confirmedAt?.getTime() ?? null),
    abonos: abonos.map((a) => a.paymentDate?.getTime() ?? null),
    historial: historial.map((h) => h.createdAt.getTime()),
    cargos: cargos.map((c) => [c.createdAt.getTime(), c.paymentDate?.getTime() ?? null]),
  };
}

const guardarEditarOrden = (extra: Record<string, unknown>) =>
  llamar(items.adminUpdateOrderItemsFulfillmentAction, {
    returnTo: `/admin/ordenes/${ctx.orderId}`,
    orderId: ctx.orderId,
    orderItemId: ctx.itemId,
    fulfillmentMode: "MANUFACTURE",
    ...extra,
  });

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  const linea = {
    productId: datos.producto.id,
    supplierId: datos.proveedora.id,
    quantity: 1,
    unitPrice: 300_000,
    fulfillmentMode: "MANUFACTURE",
    color: "Negro",
  };
  sinError(
    await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: "Clienta Prueba",
      email: "clienta@prueba.local",
      phone: "3000000002",
      address: "Calle 1 # 2-3",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: [linea],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: "100000",
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    }),
  );
  const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
  ctx.saleId = sale.id;
  sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: sale.id }));
  const order = await prisma.order.findFirstOrThrow({ where: { saleId: sale.id }, include: { items: true } });
  ctx.orderId = order.id;
  ctx.itemId = order.items[0].id;
  sinError(
    await llamar(items.adminConfirmOrderItemAction, {
      orderItemId: ctx.itemId,
      supplierId: datos.proveedora.id,
      purchaseCost: "100000",
      fechaFabricacion: sumarDias(todayInColombia(), 10),
    }),
  );
  // Dos abonos en fechas distintas de la de la orden (escritos a mano: medianoche UTC).
  await prisma.salePayment.updateMany({ where: { saleId: sale.id }, data: { paymentDate: new Date("2026-10-05T00:00:00Z") } });
  await prisma.salePayment.create({
    data: {
      saleId: sale.id,
      amount: 50_000,
      paymentMethod: "TRANSFERENCIA",
      paymentDate: new Date("2026-10-20T00:00:00Z"),
      accountId: datos.cuenta.id,
      sortOrder: 1,
    },
  });
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("«Editar orden» y la fecha de los abonos", () => {
  it("cambiar el color y guardar sin tocar la fecha: ninguna fecha cambia", async () => {
    const antes = await fechas();
    expect(antes.abonos).toEqual([new Date("2026-10-05T00:00:00Z").getTime(), new Date("2026-10-20T00:00:00Z").getTime()]);
    sinError(
      await llamar(orders.adminChangeSaleItemColorAction, {
        orderItemId: ctx.itemId,
        color: "Blanco",
        motivo: "La clienta pidió otro color",
        returnTo: `/admin/ordenes/${ctx.orderId}`,
      }),
    );
    // Lo que manda el cuadro: sin orderDate (no se tocó)…
    const sinFecha = await guardarEditarOrden({});
    expect(sinFecha.ok).toBe("Orden actualizada");
    expect(await fechas()).toEqual(antes);
    // …y un formulario viejo que manda el mismo día que ya tiene la orden.
    const mismaFecha = await guardarEditarOrden({ orderDate: colombiaDayKey(new Date(antes.orden[0] as number)) });
    expect(mismaFecha.ok).toBe("Orden actualizada");
    expect(await fechas()).toEqual(antes);
  });

  it("fecha nueva sin confirmar: error y nada cambia", async () => {
    const antes = await fechas();
    const resultado = await guardarEditarOrden({ orderDate: "2026-11-02" });
    expect(resultado.error).toContain("marca la casilla");
    expect(await fechas()).toEqual(antes);
  });

  it("fecha nueva confirmada: los abonos quedan en la fecha nueva", async () => {
    sinError(
      await guardarEditarOrden({
        orderDate: "2026-11-02",
        [CONFIRMAR_FECHA_ABONOS_FIELD]: "1",
        motivoRetroactivo: "La orden se hizo el 2 de noviembre",
      }),
    );
    const despues = await prisma.salePayment.findMany({ where: { saleId: ctx.saleId } });
    expect(despues.map((a) => colombiaDayKey(a.paymentDate as Date))).toEqual(["2026-11-02", "2026-11-02"]);
    const orden = await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
    expect(colombiaDayKey(orden.createdAt)).toBe("2026-11-02");
  });
});
