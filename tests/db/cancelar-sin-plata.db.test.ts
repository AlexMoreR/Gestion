import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion, tomarFoto } from "./helpers";

// Cancelar y reactivar una orden de venta (parte 3): Balances, comisiones, saldos, abonos, cuentas de proveedoras
// (SupplierLedgerEntry) y fletes quedan idénticos. Mismo patrón que devoluciones-sin-plata.db.test.ts.
// Las canceladas de la prueba tienen abono parcial: una venta pagada por completo sí sale de Balances al cancelar su
// orden (regla «Orden cancelada: no cuenta» de recognition.ts), que no es un movimiento de plata.
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
const ledger = await import("@/app/actions/supplier-ledger-actions");
const dispatches = await import("@/app/actions/dispatch-actions");
const { createPrismaBalancesRepository } = await import("@/modules/balances/infrastructure/prisma-balances-repository");
const { createPrismaAsesorRepository } = await import("@/modules/asesor/infrastructure/prisma-asesor-repository");
const { getMonthlyCommissionsUseCase } = await import("@/modules/asesor/application/use-cases");
const { CANCEL_BLOCK_DISPATCH } = await import("@/lib/order-cancellation");
const { listCanceladaFilas } = await import("@/lib/order-cancellations-report.server");
const page = await import("@/app/(workspace)/admin/ordenes/canceladas/page");
const { sumarDias } = await import("@/lib/delivery-tracking");
const { todayInColombia } = await import("@/lib/colombia-time");
const hoy = todayInColombia();
const fechaFabricacion = sumarDias(hoy, 10);

let datos: Awaited<ReturnType<typeof sembrar>>;

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

// Todo lo de plata: Balances (ganancia por venta y resumen), comisiones, saldos, abonos, pagos, cargos y fletes.
async function fotoDePlata() {
  const balances = createPrismaBalancesRepository();
  const [mes, anio] = [Number(hoy.slice(5, 7)), Number(hoy.slice(0, 4))];
  const [ganancias, metricas, saldos, comisiones, base, cargos, fletes, movimientos, abonos, ventas] = await Promise.all([
    balances.listProfitReport({ page: 1, pageSize: 500 }),
    balances.getDashboardMetrics(),
    balances.listAccountBalances(),
    getMonthlyCommissionsUseCase({ balances, asesor: createPrismaAsesorRepository() }, mes, anio),
    tomarFoto(),
    prisma.supplierLedgerEntry.findMany({ orderBy: { id: "asc" }, select: { id: true, type: true, amount: true, orderId: true } }),
    prisma.shippingCost.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } }),
    prisma.accountMovement.count(),
    prisma.salePayment.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true, accountId: true, saleId: true } }),
    prisma.sale.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, total: true, downPaymentAmount: true } }),
  ]);
  return JSON.parse(
    JSON.stringify({ ganancias, metricas, saldos, comisiones, pagosProveedora: base.pagosProveedora, cargos, fletes, movimientos, abonos, ventas }),
  );
}

// Cotiza y vende con un abono (parcial o total) y crea la orden de venta.
async function vender(nombre: string, abono: number, phone: string) {
  sinError(
    await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: nombre,
      email: `${nombre.toLowerCase().replace(/\s/g, "")}@prueba.local`,
      phone, // distinto por clienta: el teléfono identifica a la clienta
      address: "Calle 10 # 20-30",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: [{ productId: datos.producto.id, supplierId: datos.proveedora.id, quantity: 1, unitPrice: 300_000, fulfillmentMode: "MANUFACTURE" }],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: String(abono),
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    }),
  );
  const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
  sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: sale.id }));
  const order = await prisma.order.findFirstOrThrow({ where: { saleId: sale.id }, include: { items: true } });
  return { orderId: order.id, orderCode: order.code, orderItemId: order.items[0].id, saleId: sale.id, saleCode: sale.code };
}

// Confirma con la proveedora (crea la OF y su cargo) y le abona.
async function confirmarYPagar(orden: { orderId: string; orderItemId: string }) {
  sinError(
    await llamar(items.adminConfirmOrderItemAction, {
      orderItemId: orden.orderItemId,
      supplierId: datos.proveedora.id,
      purchaseCost: "100000",
      fechaFabricacion,
    }),
  );
  sinError(
    await llamar(ledger.adminCreateSupplierPaymentAction, {
      supplierId: datos.proveedora.id,
      amount: "100000",
      accountId: datos.cuenta.id,
      orderId: orden.orderId,
      receipt: comprobante("pago.png"),
    }),
  );
}

const cancelar = (orderId: string, extra: Record<string, string> = {}) =>
  llamar(orders.adminCancelOrderAction, { orderId, cancelReason: "CLIENTA_CANCELO", ...extra });
const estado = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

let sinDespacho: Awaited<ReturnType<typeof vender>>;
let conOF: Awaited<ReturnType<typeof vender>>;
let despachada: Awaited<ReturnType<typeof vender>>;
let antes: unknown;

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  sinDespacho = await vender("Clienta Uno", 150_000, "3000000001");
  conOF = await vender("Clienta Dos", 150_000, "3000000002");
  await confirmarYPagar(conOF);
  // Pagada por completo y despachada: cuenta en Balances (la foto no queda vacía) y su cancelación se rechaza.
  despachada = await vender("Clienta Tres", 300_000, "3000000003");
  await confirmarYPagar(despachada);
  sinError(await llamar(items.adminBulkPickupOrderItemsAction, { orderItemIds: [despachada.orderItemId], photo: comprobante("terminado.png") }));
  sinError(
    await llamar(dispatches.adminDispatchOrderItemAction, {
      orderId: despachada.orderId,
      orderItemId: despachada.orderItemId,
      deliveryType: "SHIPPING",
      carrierSupplierId: datos.transportadora.id,
      shippingCost: "20000",
      trackingNumber: "GUIA-TRES",
      shippingAddress: "Calle 1 # 2-3",
      accountId: datos.cuenta.id,
      shippingReceipt: comprobante("flete.png"),
      estimatedDeliveryAt: `${sumarDias(hoy, 3)}T19:00`,
      embalajeAbierto: comprobante("abierto.png"),
      embalajeCerrado: comprobante("cerrado.png"),
    }),
  );
  // Una compra cancelada: no sale en la vista de canceladas (solo órdenes de venta).
  await prisma.order.create({ data: { code: "ORD-PRB-COMPRA", type: "PURCHASE", status: "CANCELLED", createdById: datos.admin.id } });
  antes = await fotoDePlata();
  const foto = antes as { abonos: unknown[]; cargos: unknown[]; fletes: unknown[]; ganancias: unknown };
  expect(foto.abonos).toHaveLength(3);
  expect(foto.fletes).toHaveLength(1);
  expect(foto.cargos.length).toBeGreaterThanOrEqual(4); // 2 cargos y 2 abonos a Rosa (+ el flete de la transportadora)
  expect(JSON.stringify(foto.ganancias)).toContain(despachada.saleCode);
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("cancelar sin plata (base real)", () => {
  it("1. cancelar sin despacho", async () => {
    sinError(await cancelar(sinDespacho.orderId, { cancelNotes: "Lo pensó mejor" }));
    expect(await estado(sinDespacho.orderId)).toBe("CANCELLED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("2. cancelar con OF abierta: avisa en la bitácora y la OF sigue sin recibir", async () => {
    sinError(await cancelar(conOF.orderId, { cancelReason: "OTRO", cancelReasonText: "Pidió otro color" }));
    expect(await estado(conOF.orderId)).toBe("CANCELLED");
    const of = await prisma.manufacturingOrder.findFirstOrThrow({ where: { orderId: conOF.orderId } });
    expect(of.receivedAt).toBeNull();
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entityId: conOF.orderId, action: "DELETE" } });
    expect((log.after as { ofsAbiertas: string[] }).ofsAbiertas).toEqual([of.code]);
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("3. cancelar con despacho activo: se rechaza y la orden no cambia", async () => {
    const estadoAntes = await estado(despachada.orderId);
    const r = await cancelar(despachada.orderId);
    expect(r.error).toBe(CANCEL_BLOCK_DISPATCH);
    expect(await estado(despachada.orderId)).toBe(estadoAntes);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: despachada.orderId, toStatus: "CANCELLED" } })).toBe(0);
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("4. reactivar: vuelve a su estado y la plata sigue igual", async () => {
    sinError(await llamar(orders.adminReactivateOrderAction, { orderId: sinDespacho.orderId, reactivateReason: "Sí la quiere" }));
    expect(await estado(sinDespacho.orderId)).not.toBe("CANCELLED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("5. la vista Canceladas: motivo, notas, cobros, sin compras ni reactivadas; sin sesión va a /unauthorized", async () => {
    let filas = await listCanceladaFilas();
    expect(filas.map((f) => f.orderId)).toEqual([conOF.orderId]);
    expect(filas[0]).toMatchObject({
      orderCode: conOF.orderCode,
      saleCode: conOF.saleCode,
      clienta: "Clienta Dos",
      productos: "1 × Silla prueba",
      asesora: "Dueño Prueba",
      canceladoPor: "Dueño Prueba",
      tieneCobros: true,
      motivo: { clave: "OTRO", etiqueta: "Otro", texto: "Pidió otro color", notas: null },
    });

    // Sin nota en el historial, el motivo sale de la bitácora.
    await prisma.orderStatusHistory.updateMany({ where: { orderId: conOF.orderId, toStatus: "CANCELLED" }, data: { note: null } });
    filas = await listCanceladaFilas();
    expect(filas[0].motivo).toEqual({ clave: "OTRO", etiqueta: "Otro", texto: "Pidió otro color", notas: null });

    const admin = sesion.user;
    try {
      sesion.user = null;
      await expect(page.default({ searchParams: Promise.resolve({}) })).rejects.toThrow("/unauthorized");
    } finally {
      sesion.user = admin;
    }
    await expect(page.default({ searchParams: Promise.resolve({ motivo: "OTRO" }) })).resolves.toBeTruthy();
  });
});
