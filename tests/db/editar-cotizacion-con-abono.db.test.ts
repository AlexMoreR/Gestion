import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion } from "./helpers";

// Editar la cotización de una venta con abono (nov-2026): la clienta pagó 500.000 de un combo de fabricación
// (1.000.000, ya en la OF de la proveedora) y un espejo de stock (200.000). Luego quita el combo y pide dos
// espejos. Se guarda desde el mismo editor: el combo se cancela en la orden con aviso en la OF, el espejo
// cambia de cantidad, el abono no se toca y queda saldo a favor. Todo o nada, con una sola nota.
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
  // Sin caché en las pruebas: lee directo.
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
const { AVISO_PRODUCTO_CANCELADO } = await import("@/lib/sale-item-cancel");

let datos: Awaited<ReturnType<typeof sembrar>>;
const ctx: { quoteId: string; clientId: string; saleId: string; orderId: string; viejoItemId: string; espejoId: string } = {
  quoteId: "",
  clientId: "",
  saleId: "",
  orderId: "",
  viejoItemId: "",
  espejoId: "",
};

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

/** Un combo de dos piezas; cada pieza con la proveedora de la prueba. */
async function combo(code: string, name: string, piezas: { code: string; name: string; price: number }[]) {
  const hijos = [];
  for (const pieza of piezas) {
    hijos.push(
      await prisma.product.create({
        data: {
          code: pieza.code,
          name: pieza.name,
          slug: pieza.code.toLowerCase(),
          thumbnailUrl: "/sin-foto.png",
          price: pieza.price,
          baseCost: pieza.price / 2,
          suppliers: { create: { supplierId: datos.proveedora.id, supplierCost: pieza.price / 2, isPreferred: true } },
        },
      }),
    );
  }
  const padre = await prisma.product.create({
    data: {
      code,
      name,
      slug: code.toLowerCase(),
      thumbnailUrl: "/sin-foto.png",
      price: piezas.reduce((suma, pieza) => suma + pieza.price, 0),
      baseCost: 0,
      isBundle: true,
      bundleComponents: { create: hijos.map((hijo, index) => ({ childId: hijo.id, quantity: 1, sortOrder: index })) },
    },
  });
  // Las líneas tal cual las manda el editor: una por pieza, con la marca del combo.
  return hijos.map((hijo) => ({
    productId: hijo.id,
    supplierId: datos.proveedora.id,
    quantity: 1,
    unitPrice: Number(hijo.price),
    fulfillmentMode: "MANUFACTURE",
    color: "Negro",
    comboKey: `k-${code}`,
    comboName: name,
    comboCode: padre.code,
    comboQuantity: 1,
  }));
}

let lineasCombo: Awaited<ReturnType<typeof combo>> = [];
const espejo = (quantity: number) => ({
  productId: ctx.espejoId,
  supplierId: null,
  quantity,
  unitPrice: 200_000,
  fulfillmentMode: "STOCK",
  color: "Blanco",
});

/** Guardar el editor (sin modo cambio) con estas líneas. */
const guardar = (lineas: unknown[], extra: Record<string, unknown> = {}) =>
  llamar(quotes.adminUpdateQuoteFullAction, {
    quoteId: ctx.quoteId,
    clientId: ctx.clientId,
    status: "ACCEPTED",
    returnTo: "/admin/cotizaciones",
    items: lineas,
    motivoEdicion: "La clienta ya no quiere el combo",
    aceptaOFEdicion: "1",
    ...extra,
  });

/** Lo que no debe moverse si la edición se rechaza. */
async function foto() {
  const [sale, quote, order, pagos] = await Promise.all([
    prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } }),
    prisma.quote.findUniqueOrThrow({ where: { id: ctx.quoteId }, include: { items: { orderBy: { id: "asc" } } } }),
    prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId }, include: { items: { orderBy: { id: "asc" } } } }),
    prisma.salePayment.findMany({ orderBy: { id: "asc" } }),
  ]);
  return {
    ventaTotal: Number(sale.total),
    ventaEstado: sale.status,
    cotizacionTotal: Number(quote.total),
    lineasCotizacion: quote.items.map((i) => i.id),
    ordenTotal: Number(order.total),
    lineasOrden: order.items.map((i) => i.id),
    pagos: pagos.map((p) => [p.id, Number(p.amount)]),
    anulados: await prisma.registroAnulado.count(),
  };
}

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  lineasCombo = await combo("CMB-ED", "Combo editado", [
    { code: "CAM-E", name: "Camilla", price: 600_000 },
    { code: "BUT-E", name: "Butaco", price: 400_000 },
  ]);
  const producto = await prisma.product.create({
    data: { code: "ESP-E", name: "Espejo", slug: "esp-e", thumbnailUrl: "/sin-foto.png", price: 200_000, baseCost: 100_000 },
  });
  ctx.espejoId = producto.id;
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
      items: [...lineasCombo, espejo(1)],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  ctx.quoteId = quote.id;
  ctx.clientId = quote.clientId;
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: "500000",
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
  // Las dos piezas del combo confirmadas en fabricación con la proveedora: quedan en su OF.
  for (const item of order.items.filter((i) => i.productId !== ctx.espejoId)) {
    sinError(
      await llamar(items.adminConfirmOrderItemAction, {
        orderItemId: item.id,
        supplierId: datos.proveedora.id,
        purchaseCost: String(Number(item.unitPrice) / 2),
        fechaFabricacion: sumarDias(todayInColombia(), 10),
      }),
    );
  }
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("editar la cotización de una venta con abono", () => {
  it("arranca con 1.200.000, un abono de 500.000 y el combo en la OF", async () => {
    const antes = await foto();
    expect(antes.ventaTotal).toBe(1_200_000);
    expect(antes.pagos.map(([, monto]) => monto)).toEqual([500_000]);
    expect(await prisma.manufacturingOrder.count({ where: { orderId: ctx.orderId } })).toBe(1);
  });

  it("guardar sin cambios no toca la venta", async () => {
    const antes = await foto();
    sinError(await guardar([...lineasCombo, espejo(1)], { motivoEdicion: "", aceptaOFEdicion: undefined }));
    expect(await foto()).toEqual(antes);
  });

  it("quitar sin motivo o sin aceptar el aviso de la OF se rechaza y no cambia nada", async () => {
    const antes = await foto();
    expect((await guardar([espejo(2)], { motivoEdicion: "no" })).error).toMatch(/mínimo 3/);
    expect((await guardar([espejo(2)], { aceptaOFEdicion: undefined })).error).toMatch(/OF/);
    expect(await foto()).toEqual(antes);
  });

  it("quita el combo y pasa el espejo a 2: total 400.000, abono intacto, saldo a favor y aviso en la OF", async () => {
    const pagosAntes = await prisma.salePayment.findMany();
    const r = await guardar([espejo(2)]);
    sinError(r);
    expect(r.url).toContain(`enviar=${ctx.quoteId}`);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } });
    expect(Number(sale.total)).toBe(400_000);
    expect(await prisma.salePayment.findMany()).toEqual(pagosAntes);
    expect(r.ok).toContain("Saldo a favor de la clienta $100.000");

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: ctx.quoteId }, include: { items: true } });
    expect(Number(quote.total)).toBe(400_000);
    expect(quote.items.map((i) => [i.productId, i.quantity])).toEqual([[ctx.espejoId, 2]]);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId }, include: { items: true } });
    expect(Number(order.total)).toBe(400_000);
    expect(order.items.map((i) => [i.productId, i.quantity])).toEqual([[ctx.espejoId, 2]]);

    // Lo quitado queda copiado con el motivo; la OF tiene el aviso; los cargos con la proveedora se anularon.
    const anulados = await prisma.registroAnulado.findMany({ where: { tabla: { in: ["OrderItem", "QuoteItem"] } } });
    expect(anulados.every((a) => a.motivo.includes("La clienta ya no quiere el combo"))).toBe(true);
    const aviso = await prisma.avisoColorOF.findFirstOrThrow({ where: { manufacturingOrder: { orderId: ctx.orderId } } });
    expect(aviso.colorNuevo).toBe(AVISO_PRODUCTO_CANCELADO);
    expect(await prisma.supplierLedgerEntry.count({ where: { orderId: ctx.orderId, type: "CHARGE" } })).toBe(0);

    // Historial: una sola nota con el total de antes y el de ahora, y su entrada en la bitácora.
    const notas = await prisma.orderNote.findMany({ where: { orderId: ctx.orderId } });
    expect(notas).toHaveLength(1);
    expect(notas[0].text).toContain("Motivo: La clienta ya no quiere el combo.");
    expect(notas[0].text).toMatch(/Quitó: .*Combo editado/);
    expect(notas[0].text).toContain("Agregó: Espejo.");
    expect(notas[0].text).toContain("Total: antes $1.200.000 → ahora $400.000 · Abonado $500.000");
    const log = await prisma.activityLog.findFirstOrThrow({ where: { summary: { startsWith: "Editó la cotización" } } });
    expect(log.entityId).toBe(ctx.orderId);
    expect(log.actorId).toBe(datos.admin.id);
  });
});
