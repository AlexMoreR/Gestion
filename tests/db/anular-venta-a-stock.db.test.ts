import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, llamar, sembrar, sesion } from "./helpers";

// Caso SAL-94 (Carolina Clavijo): venta anulada con dos productos de Fabricación de dos proveedoras.
// El lavacabeza (Cecilia, ya pagado) pasa a inventario sin deuda nueva; la Burbuja Pro (Angie) se sigue
// debiendo; se devuelve la plata en dos partes y nunca más de lo pagado. Al revender el lavacabeza en Stock,
// su costo es lo que se le cargó a Cecilia (650.000) con el código de la orden anulada.
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
const sales = await import("@/app/actions/sales-actions");
const anulada = await import("@/app/actions/cancelled-sale-actions");
const items = await import("@/app/actions/order-item-actions");
const { createPrismaBalancesRepository } = await import("@/modules/balances/infrastructure/prisma-balances-repository");

let datos: Awaited<ReturnType<typeof sembrar>>;
let caso: {
  saleId: string;
  orderId: string;
  orderCode: string;
  lavacabezaItem: string;
  burbujaItem: string;
  lavacabeza: string;
  cecilia: string;
  angie: string;
};

async function vaciarBase() {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.DATABASE_URL ?? "").hostname);
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

function sinError(r: { error: string | null; url: string }) {
  expect(r.error, `redirigió con error: ${r.url}`).toBeNull();
}

async function deuda(supplierId: string) {
  const filas = await prisma.supplierLedgerEntry.groupBy({ by: ["type"], where: { supplierId }, _sum: { amount: true } });
  const suma = (t: string) => Number(filas.find((f) => f.type === t)?._sum.amount ?? 0);
  return suma("CHARGE") - suma("PAYMENT");
}

async function stock(productId: string) {
  const r = await prisma.inventoryMovement.aggregate({ where: { productId }, _sum: { change: true } });
  return r._sum.change ?? 0;
}

async function saldoCuenta() {
  const cuentas = await createPrismaBalancesRepository().listAccountBalances();
  return cuentas.find((c) => c.id === datos.cuenta.id)!.balance;
}

const producto = (code: string, name: string) =>
  prisma.product.create({ data: { code, name, slug: code.toLowerCase(), thumbnailUrl: "/sin-foto.png", price: 1_000_000, baseCost: 400_000 } });

beforeAll(async () => {
  carpetaTemporal();
  await vaciarBase();
  datos = await sembrar();
  const cecilia = await prisma.supplier.create({ data: { name: "Cecilia Moreno", type: "MANUFACTURER" } });
  const angie = await prisma.supplier.create({ data: { name: "Angie", type: "MANUFACTURER" } });
  const lava = await producto("LAV-FIBRA", "Lavacabeza fibra de vidrio");
  const burbuja = await producto("POL-BURBUJA", "Poltrona Burbuja Pro");
  const cliente = await prisma.user.create({ data: { name: "Carolina Clavijo", email: "carolina@prueba.local", role: "CLIENTE", password: "x" } });
  const lineas = [
    { productId: lava.id, supplierId: cecilia.id, precio: 1_131_000, costo: 650_000 },
    { productId: burbuja.id, supplierId: angie.id, precio: 1_000_000, costo: 900_000 },
  ];
  const quote = await prisma.quote.create({
    data: {
      code: "COT-00200",
      clientId: cliente.id,
      createdById: datos.admin.id,
      status: "ACCEPTED",
      shareToken: "q-94",
      subtotal: 2_131_000,
      total: 2_131_000,
      items: {
        create: lineas.map((l) => ({
          productId: l.productId,
          supplierId: l.supplierId,
          unitPrice: l.precio,
          lineTotal: l.precio,
          fulfillmentMode: "MANUFACTURE" as const,
        })),
      },
    },
    include: { items: true },
  });
  const sale = await prisma.sale.create({
    data: {
      code: "SAL-00094",
      quoteId: quote.id,
      clientId: cliente.id,
      createdById: datos.admin.id,
      status: "ACTIVE",
      paymentMethod: "ANTICIPO_50_50",
      paymentReceiptUrl: "/r.png",
      paymentReceiptName: "r.png",
      paymentReceiptType: "image/png",
      invoiceToken: "s-94",
      subtotal: 2_131_000,
      total: 2_131_000,
      grossTotal: 2_131_000,
      downPaymentAmount: 1_275_000,
      salePayments: { create: { amount: 1_275_000, paymentMethod: "TRANSFERENCIA", paymentDate: new Date(), accountId: datos.cuenta.id } },
    },
  });
  const order = await prisma.order.create({
    data: {
      code: "ORD-00103",
      type: "SALE",
      saleId: sale.id,
      quoteId: quote.id,
      clientId: cliente.id,
      status: "IN_PRODUCTION",
      createdById: datos.admin.id,
      subtotal: 2_131_000,
      total: 2_131_000,
      items: {
        create: quote.items.map((q) => {
          const l = lineas.find((x) => x.productId === q.productId)!;
          return {
            quoteItemId: q.id,
            productId: q.productId,
            quantity: 1,
            unitPrice: l.precio,
            lineTotal: l.precio,
            fulfillmentMode: "MANUFACTURE" as const,
            confirmedSupplierId: l.supplierId,
            purchaseCost: l.costo,
            confirmedAt: new Date(),
            supplierPaymentStatus: "PENDING" as const,
          };
        }),
      },
    },
    include: { items: true },
  });
  for (const item of order.items) {
    const l = lineas.find((x) => x.productId === item.productId)!;
    const cargo = await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: l.supplierId,
        type: "CHARGE",
        amount: l.costo,
        note: `Compra item - Orden ${order.code}`,
        saleId: sale.id,
        orderId: order.id,
        orderItemId: item.id,
        createdById: datos.admin.id,
      },
    });
    // A doña Cecilia ya se le pagó el lavacabeza.
    if (l.supplierId === cecilia.id) {
      await prisma.supplierLedgerEntry.create({
        data: {
          supplierId: cecilia.id,
          type: "PAYMENT",
          amount: l.costo,
          saleId: sale.id,
          orderId: order.id,
          orderItemId: item.id,
          settlesEntryId: cargo.id,
          accountId: datos.cuenta.id,
          paymentDate: new Date(),
          createdById: datos.admin.id,
        },
      });
    }
  }
  caso = {
    saleId: sale.id,
    orderId: order.id,
    orderCode: order.code,
    lavacabezaItem: order.items.find((i) => i.productId === lava.id)!.id,
    burbujaItem: order.items.find((i) => i.productId === burbuja.id)!.id,
    lavacabeza: lava.id,
    cecilia: cecilia.id,
    angie: angie.id,
  };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Anular venta pasando productos a stock sin perder la deuda con la proveedora (SAL-94)", () => {
  const returnTo = () => `/admin/ordenes/${caso.orderId}`;
  let deudaCecilia = 0;
  let deudaAngie = 0;
  let saldoAntes = 0;

  it("anular la venta no cambia la deuda con ninguna proveedora", async () => {
    deudaCecilia = await deuda(caso.cecilia);
    deudaAngie = await deuda(caso.angie);
    expect(deudaCecilia).toBe(0);
    expect(deudaAngie).toBe(900_000);
    sinError(await llamar(sales.adminCancelSaleAction, { saleId: caso.saleId, motivo: "La clienta no recibió los productos", returnTo: returnTo() }));
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: caso.saleId } })).status).toBe("CANCELLED");
    expect(await deuda(caso.cecilia)).toBe(deudaCecilia);
    expect(await deuda(caso.angie)).toBe(deudaAngie);
  });

  it("pasar el lavacabeza a inventario suma 1, sin filas nuevas en la cuenta de la proveedora; repetirlo da error", async () => {
    const stockAntes = await stock(caso.lavacabeza);
    const filasAntes = await prisma.supplierLedgerEntry.count();
    const r = await llamar(anulada.adminPassCancelledItemToStockAction, {
      orderItemId: caso.lavacabezaItem,
      motivo: "Está en bodega, queda para vender",
      returnTo: returnTo(),
    });
    sinError(r);
    expect(await stock(caso.lavacabeza)).toBe(stockAntes + 1);
    expect(await prisma.supplierLedgerEntry.count()).toBe(filasAntes);
    expect(await deuda(caso.cecilia)).toBe(deudaCecilia);
    expect(await deuda(caso.angie)).toBe(deudaAngie);

    const otra = await llamar(anulada.adminPassCancelledItemToStockAction, {
      orderItemId: caso.lavacabezaItem,
      motivo: "Otra vez",
      returnTo: returnTo(),
    });
    expect(otra.error).toMatch(/ya se pasó/);
    expect(await stock(caso.lavacabeza)).toBe(stockAntes + 1);
  });

  it("dos devoluciones de 637.500 crean dos salidas de la cuenta con la venta; una tercera de 1 peso se rechaza", async () => {
    saldoAntes = await saldoCuenta();
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    for (let i = 0; i < 2; i += 1) {
      sinError(
        await llamar(anulada.adminRegisterSaleRefundAction, {
          saleId: caso.saleId,
          accountId: datos.cuenta.id,
          monto: "637500",
          fecha: hoy,
          motivo: "Devolución a la clienta",
          returnTo: returnTo(),
        }),
      );
    }
    const salidas = await prisma.accountMovement.findMany({ where: { saleId: caso.saleId } });
    expect(salidas).toHaveLength(2);
    expect(salidas.every((s) => s.type === "OUT" && Number(s.amount) === 637_500)).toBe(true);
    expect(await saldoCuenta()).toBe(saldoAntes - 1_275_000);

    const demas = await llamar(anulada.adminRegisterSaleRefundAction, {
      saleId: caso.saleId,
      accountId: datos.cuenta.id,
      monto: "1",
      fecha: hoy,
      motivo: "Devolución a la clienta",
      returnTo: returnTo(),
    });
    expect(demas.error).toMatch(/más de lo pagado/);
    expect(await prisma.accountMovement.count({ where: { saleId: caso.saleId } })).toBe(2);
    expect(await deuda(caso.cecilia)).toBe(deudaCecilia);
    expect(await deuda(caso.angie)).toBe(deudaAngie);
  });

  it("una venta nueva del lavacabeza en Stock toma costo 650.000 con el código de la orden anulada", async () => {
    const cliente = await prisma.user.create({ data: { name: "Otra clienta", email: "otra@prueba.local", role: "CLIENTE", password: "x" } });
    const orden = await prisma.order.create({
      data: {
        code: "ORD-00150",
        type: "SALE",
        clientId: cliente.id,
        status: "RELEASED",
        createdById: datos.admin.id,
        subtotal: 1_131_000,
        total: 1_131_000,
        items: {
          create: { productId: caso.lavacabeza, quantity: 1, unitPrice: 1_131_000, lineTotal: 1_131_000, fulfillmentMode: "STOCK" },
        },
      },
      include: { items: true },
    });
    sinError(await llamar(items.adminConfirmStockOrderItemAction, { orderItemId: orden.items[0].id, returnTo: `/admin/ordenes/${orden.id}` }));
    const linea = await prisma.orderItem.findUniqueOrThrow({ where: { id: orden.items[0].id } });
    expect(Number(linea.purchaseCost)).toBe(650_000);
    expect(linea.stockCostSource).toBe(caso.orderCode);
    expect(await deuda(caso.cecilia)).toBe(deudaCecilia);
  });

  it("anular una devolución la copia en Anulados y la plata vuelve a la cuenta; la Burbuja Pro sigue debiéndose", async () => {
    const [primera] = await prisma.accountMovement.findMany({ where: { saleId: caso.saleId }, orderBy: { createdAt: "asc" } });
    sinError(await llamar(anulada.adminAnnulSaleRefundAction, { movementId: primera.id, motivo: "Monto mal escrito", returnTo: returnTo() }));
    expect(await prisma.accountMovement.count({ where: { saleId: caso.saleId } })).toBe(1);
    expect(await prisma.registroAnulado.count({ where: { tabla: "AccountMovement", registroId: primera.id } })).toBe(1);
    expect(await saldoCuenta()).toBe(saldoAntes - 637_500);
    expect(await deuda(caso.angie)).toBe(900_000);
    // La Burbuja Pro no se ha pasado: sigue sin entrada de inventario.
    expect(await prisma.inventoryMovement.count({ where: { sourceOrderItemId: caso.burbujaItem } })).toBe(0);
  });
});
