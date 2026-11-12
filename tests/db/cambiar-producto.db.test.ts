import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion } from "./helpers";

// «Cambiar producto» en un solo paso (nov-2026), con el caso de la ORD-106: una venta con un solo combo de
// fabricación ya en la OF de la proveedora y un abono de 500.000 se cambia por otro combo. El total pasa a ser
// el del combo nuevo, el abono no se toca y el saldo es el nuevo total menos 500.000. Todo o nada.
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
const { sumarDias } = await import("@/lib/delivery-tracking");
const { todayInColombia } = await import("@/lib/colombia-time");
const { AVISO_PRODUCTO_CANCELADO } = await import("@/lib/sale-item-cancel");

let datos: Awaited<ReturnType<typeof sembrar>>;
const ctx: { quoteId: string; clientId: string; saleId: string; orderId: string; viejoItemId: string } = {
  quoteId: "",
  clientId: "",
  saleId: "",
  orderId: "",
  viejoItemId: "",
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

let lineasViejas: Awaited<ReturnType<typeof combo>> = [];
let lineasNuevas: Awaited<ReturnType<typeof combo>> = [];

/** Guardar el editor en modo cambio: las líneas viejas iguales + las nuevas. */
const cambiar = (extra: Record<string, unknown>) =>
  llamar(quotes.adminUpdateQuoteFullAction, {
    quoteId: ctx.quoteId,
    clientId: ctx.clientId,
    status: "ACCEPTED",
    returnTo: `/admin/ordenes/${ctx.orderId}`,
    items: [...lineasViejas, ...lineasNuevas],
    cambiarOrderItemId: ctx.viejoItemId,
    motivoCambio: "La clienta pidió el otro combo",
    aceptaOFCambio: "1",
    ...extra,
  });

/** Lo que no debe moverse si el cambio se rechaza. */
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
    ordenEstado: order.status,
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
  lineasViejas = await combo("CMB-VIEJO", "Combo viejo", [
    { code: "CAM-V", name: "Camilla vieja", price: 600_000 },
    { code: "BUT-V", name: "Butaco viejo", price: 400_000 },
  ]);
  lineasNuevas = await combo("CMB-NUEVO", "Combo nuevo", [
    { code: "CAM-N", name: "Camilla nueva", price: 800_000 },
    { code: "BUT-N", name: "Butaco nuevo", price: 400_000 },
  ]);
  sinError(
    await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: "Yariza Prueba",
      email: "yariza@prueba.local",
      phone: "3000000001",
      address: "Calle 1 # 2-3",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: lineasViejas,
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
  ctx.viejoItemId = order.items[0].id;
  // Las dos piezas confirmadas en fabricación con la proveedora: quedan en su OF.
  for (const item of order.items) {
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

describe("cambiar un producto de una venta en un solo paso (caso ORD-106)", () => {
  it("arranca como la ORD-106: un combo de 1.000.000, en la OF, con un abono de 500.000", async () => {
    const antes = await foto();
    expect(antes.ventaTotal).toBe(1_000_000);
    expect(antes.pagos.map(([, monto]) => monto)).toEqual([500_000]);
    expect(await prisma.manufacturingOrder.count({ where: { orderId: ctx.orderId } })).toBe(1);
  });

  it("sin motivo o sin aceptar el aviso de la OF se rechaza y no cambia nada", async () => {
    const antes = await foto();
    expect((await cambiar({ motivoCambio: "no" })).error).toMatch(/mínimo 3/);
    expect((await cambiar({ aceptaOFCambio: undefined })).error).toMatch(/OF/);
    expect(await foto()).toEqual(antes);
  });

  it("si el viejo ya salió en un despacho, todo queda igual (todo o nada)", async () => {
    const antes = await foto();
    const despacho = await prisma.dispatch.create({
      data: {
        code: "DES-PRUEBA",
        orderId: ctx.orderId,
        createdById: datos.admin.id,
        items: { create: { orderItemId: ctx.viejoItemId, quantity: 1 } },
      },
    });
    const r = await cambiar({});
    expect(r.error).toMatch(/despacho/);
    expect(await foto()).toEqual(antes);
    await prisma.dispatch.delete({ where: { id: despacho.id } });
  });

  it("con la orden cancelada y sin la casilla «Reactivar» se rechaza", async () => {
    sinError(await llamar(orders.adminCancelOrderAction, { orderId: ctx.orderId, cancelReason: "ERROR_AL_CARGAR" }));
    const antes = await foto();
    expect(antes.ordenEstado).toBe("CANCELLED");
    const r = await cambiar({});
    expect(r.error).toMatch(/Reactivar/);
    expect(await foto()).toEqual(antes);
  });

  it("con la casilla queda reactivada y cambiada: total del combo nuevo, abono intacto y saldo bien", async () => {
    const pagosAntes = await prisma.salePayment.findMany();
    const r = await cambiar({ reactivarCambio: "1" });
    sinError(r);
    expect(r.url.startsWith(`/admin/ordenes/${ctx.orderId}?`)).toBe(true);
    expect(r.ok).toContain("Se cambió Combo viejo por Combo nuevo");

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } });
    const pagos = await prisma.salePayment.findMany();
    const pagado = pagos.reduce((suma, p) => suma + Number(p.amount), 0);
    expect(Number(sale.total)).toBe(1_200_000);
    expect(pagos).toEqual(pagosAntes);
    expect(pagado).toBe(500_000);
    expect(Number(sale.total) - pagado).toBe(700_000);
    expect(sale.status).toBe("ACTIVE");
    expect(r.ok).toContain("Saldo: $700.000");

    // La cotización y la orden tienen solo el combo nuevo; la orden ya no está cancelada.
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: ctx.quoteId }, include: { items: true } });
    expect(Number(quote.total)).toBe(1_200_000);
    expect(quote.items.map((i) => i.productId).sort()).toEqual(lineasNuevas.map((l) => l.productId).sort());
    const order = await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId }, include: { items: true } });
    expect(order.status).not.toBe("CANCELLED");
    expect(Number(order.total)).toBe(1_200_000);
    expect(order.items.map((i) => i.productId).sort()).toEqual(lineasNuevas.map((l) => l.productId).sort());

    // Lo viejo queda copiado con el motivo; la OF tiene el aviso; los cargos viejos con la proveedora se anularon.
    const anulados = await prisma.registroAnulado.findMany({ where: { tabla: { in: ["OrderItem", "QuoteItem"] } } });
    expect(anulados).toHaveLength(4);
    expect(anulados.every((a) => a.motivo.includes("La clienta pidió el otro combo"))).toBe(true);
    const aviso = await prisma.avisoColorOF.findFirstOrThrow({ where: { manufacturingOrder: { orderId: ctx.orderId } } });
    expect(aviso.colorNuevo).toBe(AVISO_PRODUCTO_CANCELADO);
    expect(aviso.producto).toBe("Combo viejo");
    expect(await prisma.supplierLedgerEntry.count({ where: { orderId: ctx.orderId, type: "CHARGE" } })).toBe(0);

    // Historial: la reactivación, una sola nota y una entrada «Cambió…» con quién lo hizo.
    const historial = await prisma.orderStatusHistory.findFirstOrThrow({
      where: { orderId: ctx.orderId, fromStatus: "CANCELLED" },
      orderBy: { createdAt: "desc" },
    });
    expect(historial.note).toContain("Cambio de producto: La clienta pidió el otro combo");
    const notas = await prisma.orderNote.findMany({ where: { orderId: ctx.orderId } });
    expect(notas).toHaveLength(1);
    expect(notas[0].text).toBe(
      "Cambió Combo viejo por Combo nuevo. Motivo: La clienta pidió el otro combo. Total: $1.200.000 · Saldo: $700.000",
    );
    const log = await prisma.activityLog.findFirstOrThrow({ where: { summary: { startsWith: "Cambió Combo viejo" } } });
    expect(log.entityId).toBe(ctx.orderId);
    expect(log.actorId).toBe(datos.admin.id);
  });
});
