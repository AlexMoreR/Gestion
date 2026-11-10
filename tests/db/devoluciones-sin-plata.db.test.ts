import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion, tomarFoto } from "./helpers";

// Devoluciones (Fase 1): registrar, editar, anular y cerrar no cambian Balances, comisiones, saldos de cuentas,
// abonos, pagos a proveedoras ni stock. Se saca la foto antes, se hacen todos los caminos y se compara.
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
const returns = await import("@/app/actions/order-return-actions");
const { createPrismaBalancesRepository } = await import("@/modules/balances/infrastructure/prisma-balances-repository");
const { createPrismaAsesorRepository } = await import("@/modules/asesor/infrastructure/prisma-asesor-repository");
const { getMonthlyCommissionsUseCase } = await import("@/modules/asesor/application/use-cases");
const { createPrismaInventoryRepository } = await import("@/modules/inventory/infrastructure/prisma-inventory-repository");
const { listDevolucionFilas } = await import("@/lib/order-returns-report.server");
const { sumarDias } = await import("@/lib/delivery-tracking");
const { todayInColombia } = await import("@/lib/colombia-time");
const hoy = todayInColombia();
const fechaFabricacion = sumarDias(hoy, 10);

let datos: Awaited<ReturnType<typeof sembrar>>;

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

// Todo lo de plata y stock que puede ver alguien: Balances, comisiones, saldos, abonos, pagos, fletes y stock.
async function fotoDePlata() {
  const balances = createPrismaBalancesRepository();
  const [mes, anio] = [Number(hoy.slice(5, 7)), Number(hoy.slice(0, 4))];
  const [ganancias, metricas, saldos, comisiones, base, stock, cargos, fletes, movimientos, ventas, ordenes] = await Promise.all([
    balances.listProfitReport({ page: 1, pageSize: 500 }),
    balances.getDashboardMetrics(),
    balances.listAccountBalances(),
    getMonthlyCommissionsUseCase({ balances, asesor: createPrismaAsesorRepository() }, mes, anio),
    tomarFoto(),
    createPrismaInventoryRepository().listProductStocks(),
    prisma.supplierLedgerEntry.findMany({ orderBy: { id: "asc" }, select: { id: true, type: true, amount: true } }),
    prisma.shippingCost.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } }),
    prisma.accountMovement.count(),
    prisma.sale.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, total: true } }),
    prisma.order.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, total: true } }),
  ]);
  return JSON.parse(
    JSON.stringify({
      ganancias,
      metricas,
      saldos,
      comisiones,
      abonos: base.abonos,
      pagosProveedora: base.pagosProveedora,
      stockMovimientos: [...base.stock.entries()],
      stock: stock.map((s) => [s.productId, s.stock]),
      cargos,
      fletes,
      movimientos,
      ventas,
      ordenes,
    }),
  );
}

// Cotiza, vende con abono, crea la orden, confirma con la proveedora, la paga, la recoge y la despacha con flete.
async function venderYDespachar(nombre: string, cantidad: number) {
  sinError(
    await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: nombre,
      email: `${nombre.toLowerCase().replace(/\s/g, "")}@prueba.local`,
      phone: "3000000000",
      address: "Calle 10 # 20-30",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: [
        { productId: datos.producto.id, supplierId: datos.proveedora.id, quantity: cantidad, unitPrice: 300_000, fulfillmentMode: "MANUFACTURE" },
      ],
    }),
  );
  const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  sinError(
    await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: quote.id,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: String(300_000 * cantidad),
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    }),
  );
  const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
  sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: sale.id }));
  const order = await prisma.order.findFirstOrThrow({ where: { saleId: sale.id }, include: { items: true } });
  const orderItemId = order.items[0].id;
  sinError(
    await llamar(items.adminConfirmOrderItemAction, {
      orderItemId,
      supplierId: datos.proveedora.id,
      purchaseCost: "100000",
      fechaFabricacion,
    }),
  );
  sinError(
    await llamar(ledger.adminCreateSupplierPaymentAction, {
      supplierId: datos.proveedora.id,
      amount: String(100_000 * cantidad),
      accountId: datos.cuenta.id,
      orderId: order.id,
      receipt: comprobante("pago.png"),
    }),
  );
  sinError(await llamar(items.adminBulkPickupOrderItemsAction, { orderItemIds: [orderItemId], photo: comprobante("terminado.png") }));
  sinError(
    await llamar(dispatches.adminDispatchOrderItemAction, {
      orderId: order.id,
      orderItemId,
      deliveryType: "SHIPPING",
      carrierSupplierId: datos.transportadora.id,
      shippingCost: "20000",
      trackingNumber: `GUIA-${nombre}`,
      shippingAddress: "Calle 1 # 2-3",
      accountId: datos.cuenta.id,
      shippingReceipt: comprobante("flete.png"),
      estimatedDeliveryAt: `${sumarDias(hoy, 3)}T19:00`,
      embalajeAbierto: comprobante("abierto.png"),
      embalajeCerrado: comprobante("cerrado.png"),
    }),
  );
  const dispatch = await prisma.dispatch.findFirstOrThrow({ where: { orderId: order.id } });
  // Sale con la transportadora («En camino»): recién ahí se puede devolver.
  sinError(await llamar(dispatches.adminUpdateDispatchStatusAction, { dispatchId: dispatch.id, status: "SHIPPED" }));
  return { orderId: order.id, orderItemId, dispatchId: dispatch.id, saleId: sale.id };
}

const registro = (orden: { orderId: string; orderItemId: string; dispatchId: string }, cantidad: number, extra: Record<string, string> = {}) => ({
  orderId: orden.orderId,
  returnDispatchId: orden.dispatchId,
  returnDate: hoy,
  returnReason: "NO_LO_QUISO",
  returnLocation: "EN_TRANSITO",
  returnNextStep: "POR_DEFINIR",
  returnFreight: "15000",
  [`returnQty:${orden.orderItemId}`]: String(cantidad),
  ...extra,
});

const ultimaDevolucion = (orderId: string) => prisma.orderReturn.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } });

let enCamino: Awaited<ReturnType<typeof venderYDespachar>>;
let entregada: Awaited<ReturnType<typeof venderYDespachar>>;
let antes: unknown;

// Base limpia antes y después (los otros archivos de test:db usan los mismos datos base). global-setup ya exige un
// Postgres en localhost; se vuelve a mirar por si acaso.
async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  enCamino = await venderYDespachar("Clienta Uno", 2);
  entregada = await venderYDespachar("Clienta Dos", 1);
  sinError(
    await llamar(dispatches.adminCompleteDeliveryAction, {
      dispatchId: entregada.dispatchId,
      deliveryPhoto: comprobante("entrega.png"),
      confirmedReceived: "on",
    }),
  );
  expect((await prisma.order.findUniqueOrThrow({ where: { id: entregada.orderId } })).status).toBe("COMPLETED");
  antes = await fotoDePlata();
  // La foto no está vacía: las dos ventas pagadas cuentan en Balances y tienen flete, abonos y pagos.
  const foto = antes as { fletes: unknown[]; abonos: { cantidad: number }; pagosProveedora: { cantidad: number }; ganancias: unknown };
  expect(foto.fletes).toHaveLength(2);
  expect(foto.abonos.cantidad).toBe(2);
  // 2 a la proveedora y 2 a la transportadora (el flete pagado desde la cuenta).
  expect(foto.pagosProveedora.cantidad).toBe(4);
  expect(JSON.stringify(foto.ganancias).match(/SAL-/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
});

afterAll(async () => {
  await vaciarBase();
  await prisma.$disconnect();
});

describe("devoluciones sin plata (base real)", () => {
  it("1. parcial: 1 de 2 en camino; el despacho sigue en camino", async () => {
    sinError(await llamar(returns.adminRegisterOrderReturnAction, registro(enCamino, 1)));
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id: enCamino.dispatchId } })).status).not.toBe("RETURNED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("2. total: la otra unidad; el despacho pasa a Devuelto", async () => {
    sinError(await llamar(returns.adminRegisterOrderReturnAction, registro(enCamino, 1, { returnReason: "MAL_ESTADO" })));
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id: enCamino.dispatchId } })).status).toBe("RETURNED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("3. reenviar: «Editar» pone Qué sigue = Reenviar", async () => {
    const r = await ultimaDevolucion(enCamino.orderId);
    sinError(
      await llamar(returns.adminEditOrderReturnAction, {
        orderId: enCamino.orderId,
        returnId: r.id,
        returnReason: r.reason,
        returnLocation: "BODEGA",
        returnNextStep: "REENVIAR",
        returnFreight: "18000",
      }),
    );
    expect((await prisma.orderReturn.findUniqueOrThrow({ where: { id: r.id } })).nextStep).toBe("REENVIAR");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("4. anular la total: el despacho vuelve a En camino", async () => {
    const r = await ultimaDevolucion(enCamino.orderId);
    sinError(await llamar(returns.adminAnnulOrderReturnAction, { orderId: enCamino.orderId, returnId: r.id, annulReason: "Se registró por error" }));
    expect((await prisma.orderReturn.findUniqueOrThrow({ where: { id: r.id } })).annulledAt).not.toBeNull();
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id: enCamino.dispatchId } })).status).toBe("SHIPPED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("5. cerrar la parcial", async () => {
    const r = await prisma.orderReturn.findFirstOrThrow({ where: { orderId: enCamino.orderId, annulledAt: null } });
    sinError(await llamar(returns.adminCloseOrderReturnAction, { orderId: enCamino.orderId, returnId: r.id }));
    expect((await prisma.orderReturn.findUniqueOrThrow({ where: { id: r.id } })).closedAt).not.toBeNull();
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("6. sobre una orden entregada: queda como no entregada, la orden sigue Cerrada", async () => {
    sinError(await llamar(returns.adminRegisterOrderReturnAction, registro(entregada, 1)));
    const linea = await prisma.dispatchItem.findFirstOrThrow({ where: { dispatchId: entregada.dispatchId } });
    expect(linea.deliveryReversedAt).not.toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: entregada.orderId } })).status).toBe("COMPLETED");
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("7. anular la de la entregada y volver a registrarla y cerrarla", async () => {
    const r = await ultimaDevolucion(entregada.orderId);
    sinError(await llamar(returns.adminAnnulOrderReturnAction, { orderId: entregada.orderId, returnId: r.id, annulReason: "No volvió" }));
    expect((await prisma.dispatchItem.findFirstOrThrow({ where: { dispatchId: entregada.dispatchId } })).deliveryReversedAt).toBeNull();
    sinError(await llamar(returns.adminRegisterOrderReturnAction, registro(entregada, 1, { returnReason: "DIRECCION_ERRONEA" })));
    const nueva = await ultimaDevolucion(entregada.orderId);
    sinError(await llamar(returns.adminCloseOrderReturnAction, { orderId: entregada.orderId, returnId: nueva.id }));
    expect(await fotoDePlata()).toEqual(antes);
  });

  it("8. la vista Devoluciones ve las sin anular y las «falta registrar»", async () => {
    // Un despacho «Devuelto» sin registro (como lo deja la guía): sale como «falta registrar».
    await prisma.dispatch.update({ where: { id: enCamino.dispatchId }, data: { status: "RETURNED" } });
    const filas = await listDevolucionFilas();
    expect(filas.filter((f) => !f.faltaRegistrar)).toHaveLength(2);
    expect(filas.filter((f) => f.faltaRegistrar)).toHaveLength(0); // ya tiene devolución (cerrada) registrada
    await prisma.orderReturn.updateMany({ where: { orderId: enCamino.orderId }, data: { annulledAt: new Date() } });
    const falta = (await listDevolucionFilas()).filter((f) => f.faltaRegistrar);
    expect(falta).toHaveLength(1);
    expect(falta[0]).toMatchObject({ orderId: enCamino.orderId, transportadora: "Envíos Ya", proveedoras: ["Rosa"], perdida: 20000 });
  });
});
