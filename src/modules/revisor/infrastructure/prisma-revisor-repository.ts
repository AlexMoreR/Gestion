import { prisma } from "@/lib/prisma";
import { colombiaDayKey, colombiaDayRange, todayInColombia } from "@/lib/colombia-time";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { getCashPositionUseCase } from "@/modules/nomina/application/use-cases";

import {
  revisarBorrados,
  revisarCompras,
  revisarCuentasNegativas,
  revisarNumeracion,
  revisarProveedoras,
  revisarSalidasStock,
  revisarSaltosDeSaldo,
  revisarStockNegativo,
  revisarVentas,
  type Hallazgo,
} from "../domain/checks";

// Lectura de la base para el revisor diario. SOLO consultas: no escribe nada.

// Desde aquí todo borrado con plata pasa por anularConMotivo (migración 20261101120000):
// los borrados anteriores no tenían copia y no se reportan.
const BORRADOS_DESDE = new Date("2026-11-01T05:00:00.000Z");
const PREFIJO_SALIDA = "Salida por orden ";

export type ResultadoRevisor = {
  fecha: string;
  /** Día de los saldos: el de ayer en Colombia (completo). */
  fechaSaldos: string;
  hallazgos: Hallazgo[];
  /** Saldo al cierre de `fechaSaldos` por cuenta: el script lo devuelve mañana como `saldosAyer`. */
  saldos: Record<string, number>;
};

export async function revisarGestion(saldosAyer: Record<string, number> | null, ahora = new Date()): Promise<ResultadoRevisor> {
  const fecha = todayInColombia(ahora);
  // Ayer en Colombia: 1 ms antes de las 00:00 de hoy (un momento real, se lee en hora de Colombia).
  const fechaSaldos = colombiaDayKey(new Date(colombiaDayRange(fecha).start.getTime() - 1));
  const rangoAyer = colombiaDayRange(fechaSaldos);
  const balances = createPrismaBalancesRepository();

  const [
    ventas,
    movimientosProveedora,
    stockPorProducto,
    itemsStock,
    salidas,
    compras,
    borrados,
    ordenes,
    ventasCodigos,
    codigosCompra,
    anulados,
    posicion,
    cuentasAyer,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { status: { in: ["ACTIVE", "INVOICED"] } },
      select: { code: true, status: true, total: true, salePayments: { select: { amount: true } } },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { orderId: null, inventoryMovementId: null, dispatchId: null, settlesEntryId: null },
      select: {
        id: true,
        code: true,
        type: true,
        amount: true,
        note: true,
        orderId: true,
        orderItemId: true,
        inventoryMovementId: true,
        dispatchId: true,
        settlesEntryId: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.inventoryMovement.groupBy({ by: ["productId"], _sum: { change: true } }),
    prisma.orderItem.findMany({
      where: {
        fulfillmentMode: "STOCK",
        order: { type: "SALE", status: { not: "CANCELLED" } },
        OR: [{ confirmedAt: { not: null } }, { order: { status: { in: ["DISPATCHED", "COMPLETED"] } } }],
      },
      select: {
        productId: true,
        quantity: true,
        confirmedAt: true,
        product: { select: { name: true } },
        order: { select: { code: true, status: true } },
      },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["note", "productId"],
      where: { type: "OUT", note: { startsWith: PREFIJO_SALIDA } },
      _sum: { change: true },
    }),
    prisma.order.findMany({
      where: { type: "PURCHASE", purchaseCode: { not: null } },
      select: {
        code: true,
        status: true,
        purchaseCode: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            product: { select: { name: true } },
            dispatchItems: { select: { quantity: true, dispatch: { select: { status: true } } } },
          },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: { action: "DELETE", entityType: { in: ["SALE", "ORDER", "PURCHASE"] }, createdAt: { gte: BORRADOS_DESDE } },
      select: { entityType: true, entityId: true, entityCode: true, summary: true },
    }),
    prisma.order.findMany({ select: { code: true } }),
    prisma.sale.findMany({ select: { code: true } }),
    prisma.inventoryMovement.findMany({
      where: { purchaseCode: { not: null } },
      distinct: ["purchaseCode"],
      select: { purchaseCode: true },
    }),
    prisma.registroAnulado.findMany({ where: { codigo: { not: null } }, distinct: ["codigo"], select: { codigo: true } }),
    // Sin "plata sin cuenta": su carga enlaza fletes (escribe) y aquí solo se leen los saldos.
    getCashPositionUseCase(balances, async () => ({
      salePayments: { count: 0, amount: 0 },
      supplierPayments: { count: 0, amount: 0 },
      shippingCosts: { count: 0, amount: 0 },
    })),
    balances.listAccountBalances({ from: rangoAyer.start, to: rangoAyer.end }),
  ]);

  // Productos con stock negativo (solo se leen los que hacen falta).
  const negativos = stockPorProducto.filter((row) => (row._sum.change ?? 0) < 0);
  const productosNegativos = negativos.length
    ? await prisma.product.findMany({
        where: { id: { in: negativos.map((row) => row.productId) } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const productoPorId = new Map(productosNegativos.map((p) => [p.id, p]));

  // Entradas netas de cada compra por producto.
  const codigos = compras.map((c) => c.purchaseCode!).filter(Boolean);
  const entradas = codigos.length
    ? await prisma.inventoryMovement.groupBy({
        by: ["purchaseCode", "productId"],
        where: { purchaseCode: { in: codigos } },
        _sum: { change: true },
      })
    : [];

  // ¿El registro borrado todavía existe? ¿Tiene copia en anulados?
  const ids = borrados.map((b) => b.entityId).filter((id): id is string => Boolean(id));
  const [ventasVivas, ordenesVivas, abonosVivos, copias] = ids.length
    ? await Promise.all([
        prisma.sale.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        prisma.salePayment.findMany({ where: { id: { in: ids } }, select: { id: true } }),
        prisma.registroAnulado.findMany({ where: { registroId: { in: ids } }, select: { registroId: true } }),
      ])
    : [[], [], [], []];
  const vivos = new Set([...ventasVivas, ...ordenesVivas, ...abonosVivos].map((row) => row.id));
  const conCopia = new Set(copias.map((row) => row.registroId));

  const codigosAnulados = new Set(anulados.map((row) => row.codigo!));
  const cuentasDelNegocio = cuentasAyer.filter((cuenta) => cuenta.type !== "OWNER");

  const hallazgos: Hallazgo[] = [
    ...revisarVentas(
      ventas.map((venta) => ({
        codigo: venta.code,
        estado: venta.status,
        total: Number(venta.total),
        pagado: venta.salePayments.reduce((suma, abono) => suma + Number(abono.amount), 0),
      })),
    ),
    ...revisarProveedoras(
      movimientosProveedora.map(({ supplier, amount, code, note, type, ...resto }) => ({
        ...resto,
        codigo: code,
        tipo: type,
        monto: Number(amount),
        nota: note,
        proveedora: supplier.name,
      })),
    ),
    ...revisarStockNegativo(
      negativos.map((row) => ({
        codigo: productoPorId.get(row.productId)?.code ?? row.productId,
        nombre: productoPorId.get(row.productId)?.name ?? "Producto",
        stock: row._sum.change ?? 0,
      })),
    ),
    ...revisarSalidasStock(
      itemsStock.map((item) => ({
        orden: item.order.code,
        estadoOrden: item.order.status,
        productId: item.productId,
        producto: item.product.name,
        cantidad: item.quantity,
        confirmado: item.confirmedAt !== null,
      })),
      new Map(
        salidas.map((row) => [
          `${(row.note ?? "").slice(PREFIJO_SALIDA.length).trim()}|${row.productId}`,
          -(row._sum.change ?? 0),
        ]),
      ),
    ),
    ...revisarCompras(
      compras.map((compra) => ({
        orden: compra.code,
        codigoCompra: compra.purchaseCode!,
        estado: compra.status,
        // Recibida: cada producto llegó completo en despachos entregados.
        recibida:
          compra.items.length > 0 &&
          compra.items.every(
            (item) =>
              item.dispatchItems
                .filter((d) => d.dispatch.status === "DELIVERED")
                .reduce((suma, d) => suma + d.quantity, 0) >= item.quantity,
          ),
        items: compra.items.map((item) => ({ productId: item.productId, producto: item.product.name, cantidad: item.quantity })),
        entradas: new Map(
          entradas.filter((row) => row.purchaseCode === compra.purchaseCode).map((row) => [row.productId, row._sum.change ?? 0]),
        ),
      })),
    ),
    ...revisarBorrados(
      borrados.map((b) => ({
        entityType: b.entityType,
        entityId: b.entityId,
        entityCode: b.entityCode,
        resumen: b.summary,
        existe: b.entityId ? vivos.has(b.entityId) : false,
        anulado: b.entityId ? conCopia.has(b.entityId) : false,
      })),
    ),
    ...revisarNumeracion("ORD", ordenes.map((o) => o.code), codigosAnulados),
    ...revisarNumeracion("SAL", ventasCodigos.map((v) => v.code), codigosAnulados),
    ...revisarNumeracion("COM", codigosCompra.map((c) => c.purchaseCode!), codigosAnulados),
    ...revisarCuentasNegativas(posicion.accounts.map((cuenta) => ({ nombre: cuenta.name, saldo: cuenta.balance }))),
    ...revisarSaltosDeSaldo(
      cuentasDelNegocio.map((cuenta) => ({
        id: cuenta.id,
        nombre: cuenta.name,
        saldoCierre: Math.round(cuenta.periodOpening + cuenta.balance),
        movimientosDelDia: Math.round(cuenta.balance),
      })),
      saldosAyer,
    ),
  ];

  return {
    fecha,
    fechaSaldos,
    hallazgos,
    saldos: Object.fromEntries(cuentasDelNegocio.map((cuenta) => [cuenta.id, Math.round(cuenta.periodOpening + cuenta.balance)])),
  };
}
