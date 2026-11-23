import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, sembrar, sesion } from "./helpers";

// «Salió del inventario» (parte 1): pasar a stock un producto de Fabricación en una orden YA entregada.
// La deuda con la proveedora baja (el cargo queda en Anulados), sale 1 del inventario y no se toca la venta,
// los abonos, el despacho ni el flete; la orden sigue entregada. También: sin stock no escribe nada, con
// manufacturingOrderId cambia toda la OF y un EMPLEADO no puede usar las acciones.
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
const { planCambioModo, aplicarCambioModo, opcionesCambioModo } = await import("@/lib/order-item-mode-change.server");
const items = await import("@/app/actions/order-item-actions");
const { hasAnyModuleAccess, setUserModuleAccess } = await import("@/lib/admin-module-access");

let datos: Awaited<ReturnType<typeof sembrar>>;
let n = 0;

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function producto(code: string) {
  return prisma.product.create({
    data: { code, name: `Producto ${code}`, slug: code.toLowerCase(), thumbnailUrl: "/sin-foto.png", price: 1_000_000, baseCost: 500_000 },
  });
}

/** Compra de inventario de 580.000 por unidad de cada producto; `entra` unidades al stock. */
async function compra(productIds: string[], entra: number) {
  n += 1;
  const orden = await prisma.order.create({
    data: {
      code: `ORD-C${n}`,
      type: "PURCHASE",
      status: "COMPLETED",
      purchaseCode: `COM-${n}`,
      createdById: datos.admin.id,
      items: {
        create: productIds.map((productId) => ({
          productId,
          quantity: 1,
          unitPrice: 580_000,
          lineTotal: 580_000,
          fulfillmentMode: "STOCK" as const,
          purchaseCost: 580_000,
          confirmedSupplierId: datos.proveedora.id,
          confirmedAt: new Date(),
        })),
      },
    },
  });
  for (const productId of productIds) {
    if (entra > 0) {
      await prisma.inventoryMovement.create({
        data: { productId, type: "IN", change: entra, note: "Compra", purchaseCode: `COM-${n}`, createdById: datos.admin.id },
      });
    }
  }
  return orden;
}

/** Venta pagada con su orden COMPLETED, despacho DELIVERED con flete y cada producto en Fabricación con cargo de 580.000. */
async function ventaEntregada(productIds: string[]) {
  n += 1;
  const cliente = await prisma.user.create({ data: { name: `Clienta ${n}`, email: `c${n}@prueba.local`, role: "CLIENTE", password: "sin-uso" } });
  const total = 1_000_000 * productIds.length;
  const quote = await prisma.quote.create({
    data: {
      code: `COT-${n}`,
      clientId: cliente.id,
      createdById: datos.admin.id,
      status: "ACCEPTED",
      shareToken: `q-${n}`,
      subtotal: total,
      total,
      items: {
        create: productIds.map((productId) => ({
          productId,
          supplierId: datos.proveedora.id,
          unitPrice: 1_000_000,
          lineTotal: 1_000_000,
          fulfillmentMode: "MANUFACTURE" as const,
        })),
      },
    },
    include: { items: true },
  });
  const sale = await prisma.sale.create({
    data: {
      code: `SAL-${n}`,
      quoteId: quote.id,
      clientId: cliente.id,
      createdById: datos.admin.id,
      status: "INVOICED",
      paymentMethod: "PAGO_TOTAL",
      paymentReceiptUrl: "/r.png",
      paymentReceiptName: "r.png",
      paymentReceiptType: "image/png",
      invoiceToken: `s-${n}`,
      subtotal: total,
      total,
      grossTotal: total,
      salePayments: { create: { amount: total, paymentMethod: "TRANSFERENCIA", paymentDate: new Date(), accountId: datos.cuenta.id } },
      shippingCosts: {
        create: {
          shippingProvider: "Envíos Ya",
          amount: 45_000,
          transactionReference: "guia",
          paymentDate: new Date(),
          accountId: datos.cuenta.id,
          createdById: datos.admin.id,
        },
      },
    },
  });
  const order = await prisma.order.create({
    data: {
      code: `ORD-${n}`,
      type: "SALE",
      saleId: sale.id,
      quoteId: quote.id,
      clientId: cliente.id,
      status: "COMPLETED",
      completedAt: new Date(),
      createdById: datos.admin.id,
      subtotal: total,
      total,
      items: {
        create: quote.items.map((q) => ({
          quoteItemId: q.id,
          productId: q.productId,
          quantity: 1,
          unitPrice: 1_000_000,
          lineTotal: 1_000_000,
          fulfillmentMode: "MANUFACTURE" as const,
          confirmedSupplierId: datos.proveedora.id,
          purchaseCost: 580_000,
          confirmedAt: new Date(),
          supplierPaymentStatus: "PENDING",
        })),
      },
    },
    include: { items: true },
  });
  for (const item of order.items) {
    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: datos.proveedora.id,
        type: "CHARGE",
        amount: 580_000,
        note: `Compra item - Orden ${order.code}`,
        saleId: sale.id,
        orderId: order.id,
        orderItemId: item.id,
        createdById: datos.admin.id,
      },
    });
  }
  const of = await prisma.manufacturingOrder.create({
    data: { code: `OF-${n}`, orderId: order.id, supplierId: datos.proveedora.id, shareToken: `of-${n}`, receivedAt: new Date() },
  });
  const dispatch = await prisma.dispatch.create({
    data: {
      code: `DSP-${n}`,
      orderId: order.id,
      status: "DELIVERED",
      shippingCost: 45_000,
      deliveredAt: new Date(),
      createdById: datos.admin.id,
      items: { create: order.items.map((i) => ({ orderItemId: i.id, quantity: 1 })) },
    },
  });
  return { sale, order, of, dispatch };
}

async function deuda() {
  const filas = await prisma.supplierLedgerEntry.groupBy({ by: ["type"], where: { supplierId: datos.proveedora.id }, _sum: { amount: true } });
  const suma = (t: string) => Number(filas.find((f) => f.type === t)?._sum.amount ?? 0);
  return suma("CHARGE") - suma("PAYMENT");
}

async function stock(productId: string) {
  const r = await prisma.inventoryMovement.aggregate({ where: { productId }, _sum: { change: true } });
  return r._sum.change ?? 0;
}

/** Lo que el cambio no debe mover: venta, abonos, despacho, fletes y estado de la orden. */
async function intocable(saleId: string, orderId: string) {
  const [sale, pagos, despachos, fletes, order] = await Promise.all([
    prisma.sale.findUniqueOrThrow({ where: { id: saleId } }),
    prisma.salePayment.findMany({ where: { saleId }, orderBy: { id: "asc" } }),
    prisma.dispatch.findMany({ where: { orderId }, orderBy: { id: "asc" } }),
    prisma.shippingCost.findMany({ where: { saleId }, orderBy: { id: "asc" } }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
  ]);
  return {
    total: Number(sale.total),
    estadoVenta: sale.status,
    pagos: pagos.map((p) => [p.id, Number(p.amount), p.accountId]),
    despachos: despachos.map((d) => [d.id, d.status, Number(d.shippingCost)]),
    fletes: fletes.map((f) => [f.id, Number(f.amount)]),
    estadoOrden: order.status,
  };
}

const actor = () => ({ id: datos.admin.id, name: datos.admin.name });

async function pasarAStock(entrada: { orderItemId?: string; manufacturingOrderId?: string }, compraId: string) {
  return prisma.$transaction(async (tx) => {
    const plan = await planCambioModo(tx, { ...entrada, compraId });
    if ("error" in plan) return plan;
    await aplicarCambioModo(tx, plan, actor(), "Salió del inventario");
    return plan;
  });
}

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Salió del inventario: Fabricación → Stock en una orden entregada", () => {
  it("baja la deuda 580.000, saca 1 del inventario y no toca venta, abonos, despacho ni flete", async () => {
    const p = await producto("CAM-1");
    const c = await compra([p.id], 1);
    const { sale, order } = await ventaEntregada([p.id]);
    const item = order.items[0];
    const antes = await intocable(sale.id, order.id);
    const deudaAntes = await deuda();
    const stockAntes = await stock(p.id);

    const opciones = await prisma.$transaction((tx) => opcionesCambioModo(tx, { orderItemId: item.id }));
    expect("error" in opciones ? opciones.error : opciones.compras.map((x) => x.id)).toContain(c.id);

    const plan = await pasarAStock({ orderItemId: item.id }, c.id);
    expect("error" in plan ? plan.error : null).toBeNull();

    expect(await deuda()).toBe(deudaAntes - 580_000);
    const anulado = await prisma.registroAnulado.findFirstOrThrow({ where: { tabla: "SupplierLedgerEntry" } });
    expect(Number(anulado.monto)).toBe(580_000);
    expect((anulado.datos as { orderItemId?: string }).orderItemId).toBe(item.id);
    expect(await prisma.supplierLedgerEntry.count({ where: { orderItemId: item.id, type: "CHARGE" } })).toBe(0);

    expect(await stock(p.id)).toBe(stockAntes - 1);
    const salida = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: p.id, type: "OUT" } });
    expect(salida.change).toBe(-1);
    expect(salida.note?.startsWith("Salida por orden ")).toBe(true);

    const despues = await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(despues.fulfillmentMode).toBe("STOCK");
    expect(despues.confirmedSupplierId).toBeNull();
    expect(Number(despues.purchaseCost)).toBe(580_000);
    expect(despues.stockCostSource).toBe(c.code);

    expect(await intocable(sale.id, order.id)).toEqual(antes);
    expect(antes.estadoOrden).toBe("COMPLETED");
  });

  it("sin stock devuelve el error de faltaStock y no escribe nada", async () => {
    const p = await producto("CAM-2");
    const c = await compra([p.id], 0);
    const { sale, order } = await ventaEntregada([p.id]);
    const antes = await intocable(sale.id, order.id);
    const [deudaAntes, anulados, movimientos] = await Promise.all([
      deuda(),
      prisma.registroAnulado.count(),
      prisma.inventoryMovement.count(),
    ]);

    const plan = await pasarAStock({ orderItemId: order.items[0].id }, c.id);
    expect("error" in plan ? plan.error : null).toBe(`No hay stock de ${p.name}: hay 0 y se necesitan 1.`);

    expect(await deuda()).toBe(deudaAntes);
    expect(await prisma.registroAnulado.count()).toBe(anulados);
    expect(await prisma.inventoryMovement.count()).toBe(movimientos);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })).fulfillmentMode).toBe("MANUFACTURE");
    expect(await intocable(sale.id, order.id)).toEqual(antes);
  });

  it("con manufacturingOrderId pasa a stock todas las piezas de la OF de una vez", async () => {
    const a = await producto("CAM-3");
    const b = await producto("BUT-3");
    const c = await compra([a.id, b.id], 1);
    const { sale, order, of } = await ventaEntregada([a.id, b.id]);
    const antes = await intocable(sale.id, order.id);
    const deudaAntes = await deuda();

    const opciones = await prisma.$transaction((tx) => opcionesCambioModo(tx, { manufacturingOrderId: of.id }));
    if ("error" in opciones) throw new Error(opciones.error);
    expect(opciones.piezas.map((x) => x.id).sort()).toEqual(order.items.map((i) => i.id).sort());
    expect(opciones.producto).toBe(of.code);

    const plan = await pasarAStock({ manufacturingOrderId: of.id }, c.id);
    expect("error" in plan ? plan.error : null).toBeNull();

    expect(await deuda()).toBe(deudaAntes - 2 * 580_000);
    const lineas = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(lineas.every((l) => l.fulfillmentMode === "STOCK")).toBe(true);
    expect(await stock(a.id)).toBe(0);
    expect(await stock(b.id)).toBe(0);
    expect(await intocable(sale.id, order.id)).toEqual(antes);
  });

  it("un EMPLEADO con el módulo Órdenes no puede usar las acciones", async () => {
    const empleado = await prisma.user.create({ data: { name: "Empleada", email: "empleada@prueba.local", role: "EMPLEADO", password: "sin-uso" } });
    await setUserModuleAccess(empleado.id, ["orders"]);
    expect(await hasAnyModuleAccess(empleado.id, "EMPLEADO", ["orders"])).toBe(true);
    const dueno = sesion.user;
    sesion.user = { id: empleado.id, role: "EMPLEADO" as "ADMIN", name: "Empleada", email: "empleada@prueba.local" };
    try {
      await expect(items.opcionesCambioModoAction({ orderItemId: "x" })).rejects.toMatchObject({ url: "/unauthorized" });
      await expect(items.previsualizarCambioModoAction(new FormData())).rejects.toMatchObject({ url: "/unauthorized" });
      await expect(items.adminCambiarModoConfirmadoAction(new FormData())).rejects.toMatchObject({ url: "/unauthorized" });
    } finally {
      sesion.user = dueno;
    }
  });
});
