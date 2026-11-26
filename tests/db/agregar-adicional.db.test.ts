import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion } from "./helpers";

// «Agregar adicional» a una venta ya creada (nov-2026): una venta de 1.129.000 con 565.000 abonados recibe una
// base cromada de 50.000. El total sube, los abonos no se tocan, queda nota y bitácora. Con costo, un cargo a la
// proveedora. Una venta o un producto cancelado lo rechaza sin cambiar nada. El editor de cotizaciones lo conserva.
vi.mock("@/auth", () => ({ auth: async () => (sesion.user ? { user: sesion.user } : null) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redireccion(url);
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <F>(fn: F) => fn,
}));
process.env.RECIBO_CAJA_AVISO = "off";

const { prisma } = await import("@/lib/prisma");
const quotes = await import("@/app/actions/quote-actions");
const sales = await import("@/app/actions/sales-actions");
const orders = await import("@/app/actions/orders-actions");
const items = await import("@/app/actions/order-item-actions");
const { sumarDias } = await import("@/lib/delivery-tracking");
const { todayInColombia } = await import("@/lib/colombia-time");
const { parseQuoteItemMeta } = await import("@/lib/quote-item-meta");

let datos: Awaited<ReturnType<typeof sembrar>>;
const ctx = { quoteId: "", clientId: "", saleId: "", orderId: "", itemId: "", productId: "" };

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

const linea = (additionalCost = 0) => ({
  productId: ctx.productId,
  supplierId: datos.proveedora.id,
  quantity: 1,
  unitPrice: 1_129_000,
  fulfillmentMode: "MANUFACTURE",
  color: "Negro",
  additionalCost,
});

const agregar = (campos: Record<string, unknown>) =>
  llamar(orders.adminAddSaleItemExtraAction, { orderItemId: ctx.itemId, descripcion: "Base cromada", precio: "50000", ...campos });

/** Lo que no debe moverse si se rechaza. */
async function foto() {
  const [sale, quote, order, pagos, cargos, notas, logs] = await Promise.all([
    prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } }),
    prisma.quote.findUniqueOrThrow({ where: { id: ctx.quoteId }, include: { items: { orderBy: { id: "asc" } } } }),
    prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId }, include: { items: { orderBy: { id: "asc" } } } }),
    prisma.salePayment.findMany({ orderBy: { id: "asc" } }),
    prisma.supplierLedgerEntry.findMany({ where: { type: "CHARGE" }, orderBy: { id: "asc" } }),
    prisma.orderNote.count(),
    prisma.activityLog.count(),
  ]);
  return {
    ventaTotal: Number(sale.total),
    ventaEstado: sale.status,
    cotizacionTotal: Number(quote.total),
    lineasCotizacion: quote.items.map((i) => [i.id, Number(i.lineTotal), i.notes]),
    ordenTotal: Number(order.total),
    lineasOrden: order.items.map((i) => [i.id, Number(i.unitPrice), Number(i.lineTotal), Number(i.purchaseCost)]),
    pagos: pagos.map((p) => [p.id, Number(p.amount)]),
    cargos: cargos.map((c) => [c.id, Number(c.amount)]),
    notas,
    logs,
  };
}

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  const producto = await prisma.product.create({
    data: {
      code: "CAM-ADIC",
      name: "Camilla adicional",
      slug: "camilla-adicional",
      thumbnailUrl: "/sin-foto.png",
      price: 1_129_000,
      baseCost: 600_000,
      suppliers: { create: { supplierId: datos.proveedora.id, supplierCost: 600_000, isPreferred: true } },
    },
  });
  ctx.productId = producto.id;
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
      items: [linea()],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  ctx.quoteId = quote.id;
  ctx.clientId = quote.clientId;
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: "565000",
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
      purchaseCost: "600000",
      fechaFabricacion: sumarDias(todayInColombia(), 10),
    }),
  );
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("agregar un adicional a una venta ya creada", () => {
  it("arranca con la venta de 1.129.000 y 565.000 abonados", async () => {
    const antes = await foto();
    expect(antes.ventaTotal).toBe(1_129_000);
    expect(antes.pagos.map(([, monto]) => monto)).toEqual([565_000]);
  });

  it("base cromada +50.000: total 1.179.000, saldo 614.000, mismos abonos, nota y bitácora, sin cargo nuevo", async () => {
    const antes = await foto();
    const r = await agregar({});
    sinError(r);
    expect(r.ok).toContain("Saldo: $614.000");

    const despues = await foto();
    expect(despues.ventaTotal).toBe(1_179_000);
    expect(despues.cotizacionTotal).toBe(1_179_000);
    expect(despues.ordenTotal).toBe(1_179_000);
    expect(despues.ventaTotal - 565_000).toBe(614_000);
    expect(despues.ventaEstado).toBe("ACTIVE");
    expect(despues.pagos).toEqual(antes.pagos);
    expect(despues.cargos).toEqual(antes.cargos);

    const quoteItem = await prisma.quoteItem.findFirstOrThrow({ where: { quoteId: ctx.quoteId } });
    expect(Number(quoteItem.lineTotal)).toBe(1_179_000);
    const meta = parseQuoteItemMeta(quoteItem.notes);
    expect(meta.additionalCost).toBe(50_000);
    expect(meta.color).toBe("Negro");
    expect(meta.adicionales).toMatchObject([{ descripcion: "Base cromada", precio: 50_000, costo: 0, porId: datos.admin.id }]);
    const orderItem = await prisma.orderItem.findUniqueOrThrow({ where: { id: ctx.itemId } });
    expect(Number(orderItem.unitPrice)).toBe(1_179_000);
    expect(Number(orderItem.lineTotal)).toBe(1_179_000);
    expect(Number(orderItem.purchaseCost)).toBe(600_000);

    const nota = await prisma.orderNote.findFirstOrThrow({ where: { orderId: ctx.orderId } });
    expect(nota.text).toBe("Adicional: Base cromada +$50.000 (total $1.129.000 → $1.179.000)");
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } });
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entityType: "SALE", summary: { startsWith: "Adicional:" } } });
    expect(log.entityCode).toBe(sale.code);
    expect(log.actorId).toBe(datos.admin.id);
  });

  it("la vista previa da el antes y después sin escribir nada", async () => {
    const antes = await foto();
    const form = new FormData();
    form.set("orderItemId", ctx.itemId);
    form.set("descripcion", "Ruedas");
    form.set("precio", "20000");
    const vista = await orders.adminPreviewSaleItemExtraAction(form);
    expect(vista).toMatchObject({ totalAntes: 1_179_000, totalDespues: 1_199_000, saldoAntes: 614_000, saldoDespues: 634_000 });
    expect(await foto()).toEqual(antes);
  });

  it("con costo 30.000: un cargo de 30.000 a la proveedora, ligado a la venta, la orden y el producto", async () => {
    const antes = await foto();
    sinError(await agregar({ descripcion: "Brazos", precio: "40000", costo: "30000" }));
    const despues = await foto();
    expect(despues.ventaTotal).toBe(1_219_000);
    expect(despues.pagos).toEqual(antes.pagos);
    expect(despues.cargos).toHaveLength(antes.cargos.length + 1);
    const cargo = await prisma.supplierLedgerEntry.findFirstOrThrow({ where: { type: "CHARGE", note: "Adicional: Brazos" } });
    expect(Number(cargo.amount)).toBe(30_000);
    expect(cargo).toMatchObject({ supplierId: datos.proveedora.id, saleId: ctx.saleId, orderId: ctx.orderId, orderItemId: ctx.itemId });
    const orderItem = await prisma.orderItem.findUniqueOrThrow({ where: { id: ctx.itemId } });
    expect(Number(orderItem.purchaseCost)).toBe(630_000);
  });

  it("datos inválidos se rechazan sin cambiar nada", async () => {
    const antes = await foto();
    expect((await agregar({ descripcion: "a" })).error).toMatch(/letras/);
    expect((await agregar({ precio: "0" })).error).toMatch(/precio/);
    expect(await foto()).toEqual(antes);
  });

  it("al volver a guardar la cotización con el editor, el adicional y el total se conservan", async () => {
    const antes = await foto();
    const r = await llamar(quotes.adminUpdateQuoteFullAction, {
      quoteId: ctx.quoteId,
      clientId: ctx.clientId,
      status: "ACCEPTED",
      returnTo: `/admin/cotizaciones/${ctx.quoteId}`,
      // El editor carga additionalCost de las notas (50.000 + 40.000) y no manda la lista de adicionales.
      items: [linea(90_000)],
    });
    sinError(r);
    const despues = await foto();
    expect(despues.cotizacionTotal).toBe(1_219_000);
    expect(despues.lineasCotizacion).toEqual(antes.lineasCotizacion);
    const quoteItem = await prisma.quoteItem.findFirstOrThrow({ where: { quoteId: ctx.quoteId } });
    expect(parseQuoteItemMeta(quoteItem.notes).adicionales.map((a) => a.descripcion)).toEqual(["Base cromada", "Brazos"]);
  });

  it("un producto cancelado se rechaza sin cambiar nada", async () => {
    await prisma.registroAnulado.create({
      data: { tabla: "OrderItem", registroId: "item-cancelado", codigo: "ORD", monto: 0, datos: {}, motivo: "prueba", origen: "PANTALLA", anuladoPorId: datos.admin.id },
    });
    const antes = await foto();
    const r = await agregar({ orderItemId: "item-cancelado" });
    expect(r.error).toMatch(/cancelado/);
    expect(await foto()).toEqual(antes);
  });

  it("una venta cancelada se rechaza sin cambiar nada", async () => {
    await prisma.sale.update({ where: { id: ctx.saleId }, data: { status: "CANCELLED" } });
    const antes = await foto();
    const r = await agregar({});
    expect(r.error).toMatch(/cancelada/);
    expect(await foto()).toEqual(antes);
  });
});
