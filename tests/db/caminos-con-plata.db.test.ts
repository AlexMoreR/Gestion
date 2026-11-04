import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar, sembrar, sesion, tomarFoto, type Foto } from "./helpers";

// Solo se simulan la sesión de ADMIN, `redirect` y `revalidatePath`; todo lo demás es la app de verdad.
vi.mock("@/auth", () => ({ auth: async () => (sesion.user ? { user: sesion.user } : null) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redireccion(url);
  },
}));
// "server-only" es solo una marca de Next para no mandar el módulo al navegador.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// El recibo de caja no sale a la red en las pruebas (el disparo fuera de petición sí se ejercita).
process.env.RECIBO_CAJA_AVISO = "off";

const { prisma } = await import("@/lib/prisma");
const quotes = await import("@/app/actions/quote-actions");
const sales = await import("@/app/actions/sales-actions");
const orders = await import("@/app/actions/orders-actions");
const items = await import("@/app/actions/order-item-actions");
const ledger = await import("@/app/actions/supplier-ledger-actions");
const inventory = await import("@/app/actions/inventory-actions");
const dispatches = await import("@/app/actions/dispatch-actions");
const catalog = await import("@/app/actions/catalog-actions");
const products = await import("@/app/actions/product-actions");
const { COTIZACION_CON_VENTA_LINEAS } = await import("@/lib/quote-lines");
const { prismaReciboCajaPuertos } = await import("@/modules/ventas/infrastructure/prisma-recibo-caja");
const { PROVEEDORA_CON_MOVIMIENTOS, PRODUCTO_CON_MOVIMIENTOS } = await import("@/lib/anulaciones");

let datos: Awaited<ReturnType<typeof sembrar>>;
let anterior: Foto | null = null;

/** Lo que vale para todos los pasos: códigos fijos, plata que no desaparece y stock que cuadra. */
async function comprobar(paso: string) {
  const foto = await tomarFoto();
  if (anterior) {
    for (const [id, codigo] of anterior.codigos) {
      expect(foto.codigos.get(id), `${paso}: el número de ${codigo} cambió o desapareció`).toBe(codigo);
    }
    expect(foto.abonos.cantidad, `${paso}: bajó la cantidad de abonos`).toBeGreaterThanOrEqual(anterior.abonos.cantidad);
    expect(foto.abonos.suma, `${paso}: bajó la suma de abonos`).toBeGreaterThanOrEqual(anterior.abonos.suma);
    expect(foto.pagosProveedora.cantidad, `${paso}: bajó la cantidad de pagos`).toBeGreaterThanOrEqual(
      anterior.pagosProveedora.cantidad,
    );
    expect(foto.pagosProveedora.suma, `${paso}: bajó la suma de pagos`).toBeGreaterThanOrEqual(anterior.pagosProveedora.suma);
  }
  for (const [producto, fila] of foto.stock) {
    expect(fila.stock, `${paso}: stock de ${producto} ≠ entradas − salidas`).toBe(fila.entradas - fila.salidas);
    expect(fila.stock, `${paso}: stock negativo`).toBeGreaterThanOrEqual(0);
  }
  anterior = foto;
  return foto;
}

function sinError(resultado: { error: string | null; url: string }) {
  expect(resultado.error, `redirigió con error: ${resultado.url}`).toBeNull();
}

const ctx: {
  quoteId?: string;
  saleId?: string;
  saleCode?: string;
  orderId?: string;
  orderItemId?: string;
  purchaseId?: string;
  purchaseItemId?: string;
  dispatchId?: string;
} = {};

beforeAll(async () => {
  carpetaTemporal();
  datos = await sembrar();
  await comprobar("inicio");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("caminos con plata (base real)", () => {
  it("1. cotizar", async () => {
    const r = await llamar(quotes.adminCreateQuoteAction, {
      clientId: "",
      name: "Clienta Prueba",
      email: "clienta@prueba.local",
      phone: "3000000000",
      address: "Calle 10 # 20-30",
      document: "",
      neighborhood: "",
      city: "Cali",
      department: "Valle del Cauca",
      items: [
        {
          productId: datos.producto.id,
          supplierId: datos.proveedora.id,
          quantity: 2,
          unitPrice: 300_000,
          fulfillmentMode: "MANUFACTURE",
        },
      ],
    });
    sinError(r);
    const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(Number(quote.total)).toBe(600_000);
    ctx.quoteId = quote.id;
    await comprobar("cotizar");
  });

  it("2. vender con abono", async () => {
    const r = await llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId: ctx.quoteId,
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptAmounts: "300000",
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    });
    sinError(r);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: ctx.quoteId }, include: { salePayments: true } });
    expect(sale.code).toMatch(/^SAL-/);
    expect(sale.salePayments).toHaveLength(1);
    ctx.saleId = sale.id;
    ctx.saleCode = sale.code;
    await comprobar("vender con abono");
  });

  it("2b. abono fuera de petición", async () => {
    // Sin petición web after() de Next lanza error: el recibo no puede tumbar el abono.
    sinError(
      await llamar(sales.adminAddSalePaymentAction, {
        saleId: ctx.saleId,
        amount: "50000",
        accountId: datos.cuenta.id,
        receipt: comprobante(),
        note: "",
        paymentDate: "",
      }),
    );
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId }, include: { salePayments: true } });
    expect(sale.salePayments).toHaveLength(2);
    // Venta con cotización (no de mostrador): sus abonos sí mandan recibo.
    expect((await prismaReciboCajaPuertos.cargarVenta(ctx.saleId!))?.esMostrador).toBe(false);
    await comprobar("abono fuera de petición");
  });

  it("3. orden", async () => {
    sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: ctx.saleId }));
    const order = await prisma.order.findFirstOrThrow({ where: { saleId: ctx.saleId }, include: { items: true } });
    expect(order.code).toMatch(/^ORD-/);
    ctx.orderId = order.id;
    ctx.orderItemId = order.items[0].id;
    await comprobar("orden");
  });

  it("4. pago a proveedora", async () => {
    sinError(
      await llamar(items.adminConfirmOrderItemAction, {
        orderItemId: ctx.orderItemId,
        supplierId: datos.proveedora.id,
        purchaseCost: "100000",
      }),
    );
    sinError(
      await llamar(ledger.adminCreateSupplierPaymentAction, {
        supplierId: datos.proveedora.id,
        amount: "80000",
        accountId: datos.cuenta.id,
        orderId: ctx.orderId,
        receipt: comprobante("pago.png"),
      }),
    );
    const pagos = await prisma.supplierLedgerEntry.count({ where: { type: "PAYMENT", orderId: ctx.orderId } });
    expect(pagos).toBe(1);
    await comprobar("pago a proveedora");
  });

  it("5a. editar la cotización con venta: líneas fijas, notas sí", async () => {
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: ctx.quoteId }, include: { items: true } });
    const linea = quote.items[0];
    const base = {
      quoteId: quote.id,
      clientId: quote.clientId,
      status: quote.status,
    };
    const mismaLinea = {
      productId: linea.productId,
      supplierId: linea.supplierId,
      quantity: linea.quantity,
      unitPrice: Number(linea.unitPrice),
      fulfillmentMode: linea.fulfillmentMode,
    };
    const bloqueada = await llamar(quotes.adminUpdateQuoteFullAction, { ...base, items: [{ ...mismaLinea, quantity: 3 }] });
    expect(bloqueada.error).toBe(COTIZACION_CON_VENTA_LINEAS);

    sinError(await llamar(quotes.adminUpdateQuoteFullAction, { ...base, notes: "Entregar en la tarde", items: [mismaLinea] }));
    const despues = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id }, include: { items: true } });
    expect(despues.notes).toBe("Entregar en la tarde");
    expect(despues.items.map((i) => i.id)).toEqual([linea.id]);
    await comprobar("editar cotización");
  });

  it("5b. editar la venta", async () => {
    sinError(await llamar(sales.adminUpdateSalePaymentMethodAction, { saleId: ctx.saleId, paymentMethod: "ANTICIPO_50_50" }));
    await comprobar("editar venta");
  });

  it("5c. editar una compra con pagos", async () => {
    sinError(
      await llamar(inventory.adminCreateDirectPurchaseAction, {
        items: [{ productId: datos.producto.id, quantity: 3, cost: 90_000, supplierId: datos.proveedora.id }],
      }),
    );
    const compra = await prisma.order.findFirstOrThrow({ where: { type: "PURCHASE" }, include: { items: true } });
    expect(compra.purchaseCode).toMatch(/^COM-/);
    ctx.purchaseId = compra.id;
    ctx.purchaseItemId = compra.items[0].id;
    sinError(
      await llamar(ledger.adminCreateSupplierPaymentAction, {
        supplierId: datos.proveedora.id,
        amount: "50000",
        accountId: datos.cuenta.id,
        orderId: compra.id,
        receipt: comprobante("pago-compra.png"),
      }),
    );
    await comprobar("comprar");

    sinError(
      await llamar(inventory.adminUpdateDirectPurchaseAction, {
        orderId: compra.id,
        items: [
          {
            orderItemId: ctx.purchaseItemId,
            productId: datos.producto.id,
            quantity: 5,
            cost: 90_000,
            supplierId: datos.proveedora.id,
          },
        ],
      }),
    );
    const foto = await comprobar("editar compra");
    expect(foto.stock.get(datos.producto.id)?.stock).toBe(5);
  });

  it("6. despachar con flete", async () => {
    // La proveedora entrega el producto (Recogido, con foto): lo que el despacho necesita antes de salir.
    sinError(
      await llamar(items.adminBulkPickupOrderItemsAction, {
        orderItemIds: [ctx.orderItemId],
        photo: comprobante("terminado.png"),
      }),
    );
    await comprobar("recoger");
    const despachoConTransportadora = {
      orderId: ctx.orderId,
      orderItemId: ctx.orderItemId,
      deliveryType: "SHIPPING",
      carrierSupplierId: datos.transportadora.id,
      shippingCost: "20000",
      trackingNumber: "GUIA-1",
      shippingAddress: "Calle 1 # 2-3",
      accountId: datos.cuenta.id,
      shippingReceipt: comprobante("flete.png"),
    };
    // Sin las 2 fotos del embalaje el despacho no se crea (ni flete ni cargo a la transportadora).
    const sinFotos = await llamar(dispatches.adminDispatchOrderItemAction, despachoConTransportadora);
    expect(sinFotos.error).toMatch(/Faltan las fotos del embalaje/);
    expect(await prisma.dispatch.count({ where: { orderId: ctx.orderId } })).toBe(0);
    expect(await prisma.shippingCost.count({ where: { saleId: ctx.saleId } })).toBe(0);
    const soloAbierta = await llamar(dispatches.adminDispatchOrderItemAction, {
      ...despachoConTransportadora,
      embalajeAbierto: comprobante("abierto.png"),
    });
    expect(soloAbierta.error).toBe("Falta la foto 2: paquete cerrado con la guía");
    expect(await prisma.dispatch.count({ where: { orderId: ctx.orderId } })).toBe(0);
    sinError(
      await llamar(dispatches.adminDispatchOrderItemAction, {
        ...despachoConTransportadora,
        embalajeAbierto: comprobante("abierto.png"),
        embalajeCerrado: comprobante("cerrado.png"),
      }),
    );
    const despacho = await prisma.dispatch.findFirstOrThrow({ where: { orderId: ctx.orderId } });
    ctx.dispatchId = despacho.id;
    const fotosEmbalaje = await prisma.embalajeFoto.findMany({ where: { orderItemId: ctx.orderItemId } });
    expect(fotosEmbalaje.map((foto) => foto.tipo).sort()).toEqual(["ABIERTO", "CERRADO"]);
    expect(fotosEmbalaje.every((foto) => foto.dispatchId === despacho.id && foto.subidoPorTexto === "Dueño Prueba")).toBe(true);
    expect(await prisma.shippingCost.count({ where: { saleId: ctx.saleId } })).toBeGreaterThan(0);
    await comprobar("despachar con flete");
  });

  it("7. entregar", async () => {
    // T-504: sin la casilla "el cliente ya recibió" la entrega se niega y no cambia nada.
    const sinCasilla = await llamar(dispatches.adminCompleteDeliveryAction, { dispatchId: ctx.dispatchId, deliveryPhoto: comprobante("entrega.png") });
    expect(sinCasilla.error).toBe("Falta confirmar que el cliente recibió");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } })).status).not.toBe("COMPLETED");
    sinError(
      await llamar(dispatches.adminCompleteDeliveryAction, {
        dispatchId: ctx.dispatchId,
        deliveryPhoto: comprobante("entrega.png"),
        confirmedReceived: "on",
      }),
    );
    const order = await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
    expect(order.status).toBe("COMPLETED");
    await comprobar("entregar");
  });

  it("7b. reversar la entrega de un producto y volver a entregarlo", async () => {
    const item = { orderItemId: ctx.orderItemId };
    const sinMotivo = await llamar(dispatches.adminReverseItemDeliveryAction, item);
    expect(sinMotivo.error).toBe("Elige el motivo.");
    const fila = () => prisma.dispatchItem.findFirstOrThrow({ where: { dispatchId: ctx.dispatchId, orderItemId: ctx.orderItemId } });
    expect((await fila()).deliveryReversedAt).toBeNull();

    // «Llegó dañado» sin foto de cómo llegó: error y no reversa nada.
    const sinFoto = await llamar(dispatches.adminReverseItemDeliveryAction, { ...item, reversalReason: "DANADO" });
    expect(sinFoto.error).toBe("Falta la foto de cómo llegó");
    expect((await fila()).deliveryReversedAt).toBeNull();
    expect(await prisma.orderItemReversal.count({ where: { orderItemId: ctx.orderItemId } })).toBe(0);
    expect(await prisma.embalajeFoto.count({ where: { orderItemId: ctx.orderItemId, tipo: "LLEGADA" } })).toBe(0);

    sinError(
      await llamar(dispatches.adminReverseItemDeliveryAction, { ...item, reversalReason: "DANADO", fotoLlegada: comprobante("llegada.png") }),
    );
    expect((await fila()).deliveryReversedAt).not.toBeNull();
    const llegada = await prisma.embalajeFoto.findMany({ where: { orderItemId: ctx.orderItemId, tipo: "LLEGADA" } });
    expect(llegada).toHaveLength(1);
    expect(llegada[0]).toMatchObject({ dispatchId: ctx.dispatchId, subidoPorTexto: "Dueño Prueba" });
    expect(
      await prisma.orderItemReversal.count({
        where: { orderItemId: ctx.orderItemId, fromState: "ENTREGADO", toState: "DESPACHADO", reason: "DANADO" },
      }),
    ).toBe(1);
    // La orden y el despacho no se mueven: Balances no cambia solo.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } })).status).toBe("COMPLETED");
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id: ctx.dispatchId } })).status).toBe("DELIVERED");
    const otraVez = await llamar(dispatches.adminReverseItemDeliveryAction, {
      ...item,
      reversalReason: "DANADO",
      fotoLlegada: comprobante("llegada.png"),
    });
    expect(otraVez.error).toBe("La entrega de este producto ya está reversada");

    sinError(await llamar(dispatches.adminRedeliverItemAction, item));
    expect((await fila()).deliveryReversedAt).toBeNull();
    expect(await prisma.activityLog.count({ where: { summary: { startsWith: "Volvió a entregar" } } })).toBe(1);

    // «Deshacer entrega» de toda la orden limpia la marca; luego se vuelve a entregar para seguir.
    sinError(await llamar(dispatches.adminReverseItemDeliveryAction, { ...item, reversalReason: "NO_LLEGO" }));
    const deshacerSinFoto = await llamar(dispatches.adminUndoDeliveryAction, { dispatchId: ctx.dispatchId, reversalReason: "DANADO" });
    expect(deshacerSinFoto.error).toBe("Falta la foto de cómo llegó");
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id: ctx.dispatchId } })).status).toBe("DELIVERED");
    sinError(await llamar(dispatches.adminUndoDeliveryAction, { dispatchId: ctx.dispatchId, reversalReason: "ERROR" }));
    expect((await fila()).deliveryReversedAt).toBeNull();
    sinError(
      await llamar(dispatches.adminCompleteDeliveryAction, {
        dispatchId: ctx.dispatchId,
        deliveryPhoto: comprobante("entrega.png"),
        confirmedReceived: "on",
      }),
    );
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } })).status).toBe("COMPLETED");
    await comprobar("reversar entrega de un producto");
  });

  it("8. anular abono", async () => {
    const abono = await prisma.salePayment.findFirstOrThrow({ where: { saleId: ctx.saleId } });
    sinError(await llamar(sales.adminVoidSalePaymentAction, { paymentId: abono.id, motivo: "Abono repetido" }));
    expect(await prisma.registroAnulado.count({ where: { tabla: "SalePayment", registroId: abono.id } })).toBe(1);
    await comprobar("anular abono");
  });

  it("9. anular venta", async () => {
    sinError(await llamar(sales.adminCancelSaleAction, { saleId: ctx.saleId, motivo: "La clienta desistió" }));
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: ctx.saleId } });
    expect(sale.status).toBe("CANCELLED");
    expect(sale.code).toBe(ctx.saleCode);
    await comprobar("anular venta");
  });

  it("10. anular compra", async () => {
    // Con pagos a la proveedora no se anula: primero se anula el pago (queda en RegistroAnulado).
    const bloqueada = await inventory.adminDeletePurchaseOrderAction(ctx.purchaseId!, "Compra mal cargada");
    expect(bloqueada.ok).toBe(false);
    const pago = await prisma.supplierLedgerEntry.findFirstOrThrow({ where: { type: "PAYMENT", orderId: ctx.purchaseId } });
    sinError(await llamar(ledger.adminDeleteSupplierPaymentAction, { paymentId: pago.id, motivo: "Pago mal cargado" }));
    await comprobar("anular pago de la compra");

    const r = await inventory.adminDeletePurchaseOrderAction(ctx.purchaseId!, "Compra mal cargada");
    expect(r.error).toBeUndefined();
    const compra = await prisma.order.findUniqueOrThrow({ where: { id: ctx.purchaseId } });
    expect(compra.status).toBe("CANCELLED");
    await comprobar("anular compra");
  });
});

describe("deshacer sin perder rastro (base real)", () => {
  const d: { saleId?: string; orderId?: string; orderItemId?: string } = {};

  it("prepara una venta con orden fabricada, recogida y despachada con flete", async () => {
    sinError(
      await llamar(quotes.adminCreateQuoteAction, {
        clientId: "",
        name: "Clienta Dos",
        email: "",
        phone: "3000000001",
        address: "Carrera 5 # 6-7",
        city: "Cali",
        document: "",
        neighborhood: "",
        department: "",
        items: [{ productId: datos.producto.id, supplierId: datos.proveedora.id, quantity: 1, unitPrice: 300_000, fulfillmentMode: "MANUFACTURE" }],
      }),
    );
    const quote = await prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    sinError(
      await llamar(sales.adminCreateSaleFromQuoteAction, {
        quoteId: quote.id,
        paymentMethod: "ANTICIPO_50_50",
        paymentReceiptAmounts: "300000",
        paymentReceipts: comprobante(),
        paymentReceiptAccounts: datos.cuenta.id,
        paymentReceiptNotes: "",
        paymentReceiptDates: "",
      }),
    );
    const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
    d.saleId = sale.id;
    sinError(await llamar(orders.adminCreateOrderFromSaleAction, { saleId: sale.id }));
    const order = await prisma.order.findFirstOrThrow({ where: { saleId: sale.id }, include: { items: true } });
    d.orderId = order.id;
    d.orderItemId = order.items[0].id;
    sinError(await llamar(items.adminConfirmOrderItemAction, { orderItemId: d.orderItemId, supplierId: datos.proveedora.id, purchaseCost: "100000" }));
    sinError(await llamar(items.adminBulkPickupOrderItemsAction, { orderItemIds: [d.orderItemId], photo: comprobante("terminado.png") }));
    sinError(
      await llamar(dispatches.adminDispatchOrderItemAction, {
        orderId: d.orderId,
        orderItemId: d.orderItemId,
        deliveryType: "SHIPPING",
        carrierSupplierId: datos.transportadora.id,
        shippingCost: "25000",
        trackingNumber: "GUIA-2",
        shippingAddress: "Carrera 5 # 6-7",
        accountId: datos.cuenta.id,
        shippingReceipt: comprobante("flete.png"),
        embalajeAbierto: comprobante("abierto.png"),
        embalajeCerrado: comprobante("cerrado.png"),
      }),
    );
    await comprobar("preparar deshacer");
  });

  it("deshacer el despacho guarda fletes, pagos a la transportadora y el despacho", async () => {
    const despacho = await prisma.dispatch.findFirstOrThrow({ where: { orderId: d.orderId } });
    const fletes = await prisma.shippingCost.count({ where: { saleId: d.saleId } });
    expect(fletes).toBeGreaterThan(0);
    // T-508: sin motivo no se reversa nada.
    const sinMotivo = await llamar(dispatches.adminUndoDispatchItemAction, { orderItemId: d.orderItemId });
    expect(sinMotivo.error).toBe("Elige el motivo.");
    expect(await prisma.dispatch.count({ where: { id: despacho.id } })).toBe(1);
    sinError(await llamar(dispatches.adminUndoDispatchItemAction, { orderItemId: d.orderItemId, reversalReason: "ERROR" }));
    const motivo = "Despacho reversado (DESPACHADO → POR_DESPACHAR): Se registró por error";
    expect(await prisma.dispatch.count({ where: { id: despacho.id } })).toBe(0);
    expect(await prisma.shippingCost.count({ where: { saleId: d.saleId } })).toBe(0);
    const guardados = await prisma.registroAnulado.findMany({ where: { motivo: { startsWith: motivo } } });
    const tablas = guardados.map((g) => g.tabla);
    expect(tablas.filter((t) => t === "ShippingCost")).toHaveLength(fletes);
    expect(tablas).toContain("SupplierLedgerEntry");
    expect(tablas).toContain("Dispatch");
    await comprobar("deshacer despacho");
  });

  it("deshacer el recogido guarda el pago a la proveedora", async () => {
    // El pago hecho al recoger (así lo dejaba el recogido con pago): ligado al producto de la orden.
    await prisma.supplierLedgerEntry.create({
      data: {
        type: "PAYMENT",
        amount: 100_000,
        supplierId: datos.proveedora.id,
        orderId: d.orderId,
        orderItemId: d.orderItemId,
        accountId: datos.cuenta.id,
        createdById: datos.admin.id,
      },
    });
    await comprobar("pago al recoger");
    const pagos = await prisma.supplierLedgerEntry.findMany({ where: { orderItemId: d.orderItemId, type: "PAYMENT" } });
    expect(pagos).toHaveLength(1);
    sinError(await llamar(items.adminUndoPickupOrderItemAction, { orderItemId: d.orderItemId }));
    const guardados = await prisma.registroAnulado.count({
      where: { tabla: "SupplierLedgerEntry", registroId: { in: pagos.map((p) => p.id) }, motivo: { startsWith: "Deshizo el recogido" } },
    });
    expect(guardados).toBe(pagos.length);
    await comprobar("deshacer recogido");
  });

  it("deshacer la confirmación guarda el cargo y el trabajo de producción", async () => {
    const cargos = await prisma.supplierLedgerEntry.count({ where: { orderItemId: d.orderItemId, type: "CHARGE" } });
    const jobs = await prisma.productionJob.count({ where: { orderItemId: d.orderItemId } });
    expect(cargos).toBeGreaterThan(0);
    sinError(await llamar(items.adminUndoConfirmOrderItemAction, { orderItemId: d.orderItemId }));
    const guardados = await prisma.registroAnulado.findMany({ where: { motivo: { startsWith: "Deshizo la fabricación" } } });
    expect(guardados.filter((g) => g.tabla === "SupplierLedgerEntry")).toHaveLength(cargos);
    expect(guardados.filter((g) => g.tabla === "ProductionJob")).toHaveLength(jobs);
    await comprobar("deshacer confirmación");
  });
});

describe("bloqueos y borrado definitivo (base real)", () => {
  it("no se elimina una proveedora con cuenta corriente ni un producto con movimientos", async () => {
    expect((await llamar(catalog.adminDeleteSupplierAction, { supplierId: datos.proveedora.id })).error).toBe(
      PROVEEDORA_CON_MOVIMIENTOS,
    );
    expect((await llamar(products.adminDeleteProductAction, { productId: datos.producto.id })).error).toBe(
      PRODUCTO_CON_MOVIMIENTOS,
    );
    await comprobar("bloqueos");
  });

  it("el borrado definitivo de una venta deja copia de abonos, orden y venta", async () => {
    const sale = await prisma.sale.findFirstOrThrow({ where: { status: { not: "CANCELLED" } }, include: { order: true } });
    sinError(await llamar(sales.adminHardDeleteSaleAction, { saleId: sale.id, motivo: "Venta de prueba" }));
    const guardados = await prisma.registroAnulado.findMany({ where: { motivo: "Venta de prueba" } });
    expect(guardados.map((g) => g.tabla)).toEqual(expect.arrayContaining(["SalePayment", "Order", "Sale"]));
    // Esta venta y su orden sí desaparecen (es lo que pide el borrado definitivo); la plata queda en RegistroAnulado.
    anterior?.codigos.delete(sale.id);
    if (sale.order) anterior?.codigos.delete(sale.order.id);
    await comprobar("borrado definitivo");
  });
});

describe("pago total (base real)", () => {
  async function cotizar(nombre: string, telefono: string) {
    sinError(
      await llamar(quotes.adminCreateQuoteAction, {
        clientId: "",
        name: nombre,
        email: "",
        phone: telefono,
        address: "Calle 1 # 2-3",
        city: "Cali",
        document: "",
        neighborhood: "",
        department: "",
        items: [{ productId: datos.producto.id, supplierId: datos.proveedora.id, quantity: 1, unitPrice: 300_000, fulfillmentMode: "MANUFACTURE" }],
      }),
    );
    return prisma.quote.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  }

  function venderConPagoTotal(quoteId: string, monto: string) {
    return llamar(sales.adminCreateSaleFromQuoteAction, {
      quoteId,
      paymentMethod: "PAGO_TOTAL",
      paymentReceiptAmounts: monto,
      paymentReceipts: comprobante(),
      paymentReceiptAccounts: datos.cuenta.id,
      paymentReceiptNotes: "",
      paymentReceiptDates: "",
    });
  }

  it("con un abono por el total queda pagada (INVOICED) y con forma de pago PAGO_TOTAL", async () => {
    const quote = await cotizar("Clienta Pago Total", "3000000010");
    sinError(await venderConPagoTotal(quote.id, "300000"));
    const sale = await prisma.sale.findUniqueOrThrow({ where: { quoteId: quote.id } });
    expect(sale.status).toBe("INVOICED");
    expect(sale.paymentMethod).toBe("PAGO_TOTAL");
    await comprobar("pago total completo");
  });

  it("con un abono menor se rechaza y no crea venta ni orden", async () => {
    const quote = await cotizar("Clienta Pago Corto", "3000000011");
    const ventas = await prisma.sale.count();
    const ordenes = await prisma.order.count();
    const r = await venderConPagoTotal(quote.id, "200000");
    expect(r.error).toBe("Con Pago total los abonos deben sumar el 100 % del total ($300.000). Faltan $100.000.");
    expect(await prisma.sale.count()).toBe(ventas);
    expect(await prisma.order.count()).toBe(ordenes);
    await comprobar("pago total incompleto");
  });
});
