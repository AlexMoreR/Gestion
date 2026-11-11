import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, CalendarClock, TrendingUp, Wallet } from "lucide-react";
import { StatList, type StatItem } from "@/components/ui/stat-list";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AddShippingLegDialog } from "@/components/admin/add-shipping-leg-dialog";
import { OrderActionsMenu } from "@/components/admin/order-actions-menu";
import { cancelBlock, hasPayments, openManufacturingOrders, ultimaCancelacion } from "@/lib/order-cancellation";
import { OrderClientCard } from "@/components/admin/order-client-card";
import { OrderHistoryTabs } from "@/components/admin/order-history-tabs";
import { EmbalajeFotosCard, gruposEmbalaje } from "@/components/admin/embalaje-fotos-card";
import { OrderNotesCard } from "@/components/admin/order-notes-card";
import { DispatchEstimateCard, type CambioFechaView } from "@/components/admin/dispatch-estimate-card";
import { colombiaDateTimeInput, todayInColombia } from "@/lib/colombia-time";
import { estadoDeEntrega, peorDe, PREFIJO_CAMBIO_FECHA } from "@/lib/delivery-tracking";
import { OrderReversalsCard } from "@/components/admin/order-reversals-card";
import { OrderReturnCard } from "@/components/admin/order-return-card";
import { OrderReturnDialog, type ReturnDispatchOption } from "@/components/admin/order-return-dialog";
import {
  estaAbierta,
  estadoDevolucionDeOrden,
  mensajeDevolucionAsesora,
  pendientesPorDevolver,
  perdidaDevolucion,
  returnLocationLabel,
  returnNextStepLabel,
  returnReasonLabel,
  type DispatchStatusKey,
} from "@/lib/order-return";
import { OrderItemsTable } from "@/components/admin/order-items-table";
import type { OfDeProveedora } from "@/components/admin/order-item-manager";
import { OrderStepper } from "@/components/admin/order-stepper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { getAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { resolveDispatchLegs, sumShippingLegs } from "@/lib/dispatch-shipping-legs";
import { computeStockExitCost } from "@/lib/stock-exit-cost";
import { computeItemUnitCost } from "@/lib/order-item-cost";
import { prisma } from "@/lib/prisma";
import { buildOrderDeliveryInfo, shortColombiaDate, whatsAppDigits } from "@/lib/order-delivery-info";
import { formatNoteDate } from "@/lib/order-notes";
import { confirmationKey, dispatchToDeliver, isOrderDeliveryDone, pendingItemsLabel } from "@/lib/order-dispatch";
import { countReversedItems, itemDeliveryState, reversalMoneyWarning, reversalReasonLabel } from "@/lib/order-item-reversal";
import {
  getDispatchStatusLabel,
  getFulfillmentModeLabel,
  getOrderDisplayState,
  getOrderStatusLabel,
} from "@/lib/orders";
import { getComboCamillasSupplierId, getSystemBrandName, getSystemCurrency } from "@/lib/system-settings";
import { getPublicAssetUrl, getSiteUrl } from "@/lib/site";
import {
  ensureManufacturingOrders,
  getManufacturingPayments,
  isManufacturingItem,
  suggestDeliveryAddress,
} from "@/lib/manufacturing-orders";
import { fechaAviso } from "@/lib/color-change";
import type { ManufacturingCard } from "@/components/admin/order-manufacturing-tab";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { adminCreateShipmentAction } from "@/app/actions/shipment-actions";
import { Button } from "@/components/ui/button";
import { phoneLast4 } from "@/modules/guias/domain/lookup";
import { SHIPMENT_STATUS_BADGE, SHIPMENT_STATUS_LABEL } from "@/modules/guias/domain/statuses";
import { computeCollectSuggestion, resolveCityFromClient } from "@/modules/guias/infrastructure/shipments-repository";
import {
  COMBO_CHECK_PRODUCT_SELECT,
  contraentregaComboWarning,
  isCamillaComboProduct,
  toComboCheckProduct,
  PAYMENT_METHOD_BADGE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_SHORT_LABEL,
} from "@/modules/ventas/domain/payment-method";
import { SaleOriginBadge } from "@/modules/ventas/presentation/sale-origin-badge";
import { ChangePaymentMethodButton } from "@/modules/ventas/presentation/change-payment-method-button";
import {
  esComboCamillas,
  esLaura,
  itemsParaPlan,
  ORDEN_COMBO_CREADA_SOLA,
} from "@/modules/ventas/domain/combo-camillas";
import { paymentMethodLabel } from "@/modules/ventas/domain/withholding";
import type { ShipmentDefaults } from "@/modules/guias/presentation/shipment-dispatch-fields";
import { displayCode } from "@/lib/code-display";
import { buildFabricationCopyText } from "@/lib/order-fabrication-info";
import { duenioDePartes, lineaFuente } from "@/lib/color-change";
import { partesPorProducto } from "@/lib/product-parts.server";
import type { ParteParaCotizar } from "@/lib/product-parts";

type PageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Formatea una fecha como YYYY-MM-DD usando componentes locales (sin desfase de
// zona horaria) para precargar el campo <input type="date">.
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function AdminOrderDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  // Un solo mapa de permisos para «orders», «sales» y «quotes» (mismo criterio que hasAdminModuleAccess).
  const moduleAccess = await getAdminModuleAccess(session.user.id, session.user.role);
  if (!moduleAccess.orders) {
    redirect("/unauthorized");
  }

  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [order, currency, carriers, accounts] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sale: {
          include: {
            salePayments: { orderBy: { sortOrder: "asc" } },
            shippingCosts: { select: { amount: true } },
            quote: {
              select: {
                id: true,
                code: true,
                shareToken: true,
                notes: true,
                createdAt: true,
                // Asesora de la venta (aviso de devolución): quien hizo la cotización, nunca quien creó la orden.
                createdBy: { select: { name: true, email: true, phone: true, teamMember: { select: { phone: true } } } },
              },
            },
          },
        },
        client: true,
        supplier: true,
        createdBy: true,
        items: {
          include: {
            product: {
              include: {
                category: { select: { name: true } },
                partOfBundles: COMBO_CHECK_PRODUCT_SELECT.partOfBundles,
                suppliers: {
                  include: { supplier: true },
                  orderBy: { isPreferred: "desc" },
                },
                // Un combo no tiene proveedor propio: se toman de sus componentes.
                bundleComponents: {
                  include: {
                    child: {
                      include: {
                        suppliers: {
                          include: { supplier: true },
                          orderBy: { isPreferred: "desc" },
                        },
                      },
                    },
                  },
                },
              },
            },
            confirmedSupplier: true,
            photos: { orderBy: { createdAt: "asc" } },
            // Fotos del embalaje y de llegada para la tarjeta; el despacho usa solo las de embalaje sin despacho.
            embalajeFotos: {
              orderBy: { createdAt: "asc" },
              select: { id: true, url: true, tipo: true, dispatchId: true, subidoPorTexto: true, createdAt: true },
            },
            supplierLedgerEntries: {
              where: { type: "PAYMENT" },
              select: { amount: true },
            },
            // Solo se cuentan: sin responsables ni producto (eran consultas de más).
            productionJobs: { select: { id: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        productionJobs: { select: { id: true } },
        dispatches: {
          include: {
            shipment: {
              select: {
                id: true,
                code: true,
                status: true,
                destinationCity: { select: { name: true, department: { select: { name: true } } } },
              },
            },
            carrierSupplier: { select: { name: true } },
            shippingLegs: {
              orderBy: { position: "asc" },
              include: { supplierPayment: { select: { receiptUrl: true, account: { select: { name: true } } } } },
            },
            items: true,
          },
          orderBy: { createdAt: "desc" },
        },
        history: {
          include: {
            changedBy: true,
          },
          orderBy: { createdAt: "desc" },
        },
        noteEntries: {
          include: { createdBy: { select: { name: true, email: true } } },
          orderBy: { createdAt: "desc" },
        },
        reversals: {
          include: {
            orderItem: { select: { product: { select: { name: true } } } },
            createdBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        returns: {
          include: {
            items: { select: { orderItemId: true, quantity: true, orderItem: { select: { product: { select: { name: true } } } } } },
            files: { select: { id: true, url: true, name: true }, orderBy: { createdAt: "asc" } },
            createdBy: { select: { name: true, email: true } },
            carrierSupplier: { select: { name: true } },
            sellerNotifiedBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getSystemCurrency(),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, displayName: true, dispatchWarning: true },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { isActive: true, type: { not: "OWNER" } },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!order) {
    notFound();
  }

  const isPurchase = order.type === "PURCHASE";
  // Cambiar color: solo en una venta (y su orden) no cancelada.
  const canChangeColor =
    !isPurchase && Boolean(order.sale) && order.sale?.status !== "CANCELLED" && order.status !== "CANCELLED";
  // Ordenes de fabricacion (OF) por proveedora: solo en ordenes de venta.
  const manufacturingItems = isPurchase ? [] : order.items.filter(isManufacturingItem);
  const manufacturingSupplierIds = manufacturingItems.map((item) => item.confirmedSupplierId ?? "");
  // Subtotales por proveedora: el costo de la OF cuando aun no hay cargos en su cuenta.
  const lineSubtotalsBySupplier = new Map<string, Array<number | null>>();
  for (const item of manufacturingItems) {
    const supplierId = item.confirmedSupplierId ?? "";
    const subtotal = item.purchaseCost == null ? null : Number(item.purchaseCost) * item.quantity;
    lineSubtotalsBySupplier.set(supplierId, [...(lineSubtotalsBySupplier.get(supplierId) ?? []), subtotal]);
  }
  // Lineas de la cotizacion: las usan «Cambiar color» y el aviso del Combo Camillas (antes eran dos consultas).
  const quoteItemsPromise =
    !isPurchase && order.sale
      ? prisma.quoteItem.findMany({
          where: { quoteId: order.sale.quoteId },
          select: {
            id: true,
            productId: true,
            notes: true,
            quantity: true,
            product: { select: { name: true, isBundle: true, code: true } },
          },
        })
      : Promise.resolve([]);

  // Todo esto depende solo de la orden: se pide a la vez en lugar de uno tras otro.
  const [returnLogs, stockExitCostEntries, partesDeItem, shipmentLookup, cambiosDeFecha, manufacturingData] =
    await Promise.all([
      // Historial de cada devolución: entradas de la bitácora de la orden marcadas con su id (after.devolucion).
      order.returns.length > 0
        ? prisma.activityLog.findMany({
            where: {
              entityType: "ORDER",
              entityId: order.id,
              OR: order.returns.map((r) => ({ after: { path: ["devolucion"], equals: r.id } })),
            },
            select: { id: true, actorName: true, summary: true, createdAt: true, after: true },
            orderBy: { createdAt: "asc" },
            take: 200,
          })
        : Promise.resolve([]),
      // Pieza por stock sin confirmar: el costo que se va a usar (compra que la entró o catálogo).
      Promise.all(
        order.items
          .filter((item) => !isPurchase && item.fulfillmentMode === "STOCK" && item.confirmedAt === null)
          .map(async (item) => [item.id, await computeStockExitCost({ productId: item.productId, quantity: item.quantity })] as const),
      ),
      // Partes de color de cada producto (para «Cambiar color» por parte): las del combo o las del producto.
      (async () => {
        const result = new Map<string, ParteParaCotizar[]>();
        if (!canChangeColor) return result;
        const codigos = [...new Set(order.items.map((item) => parseQuoteItemMeta(item.notes).comboCode.trim()).filter(Boolean))];
        const [quoteItems, combos] = await Promise.all([
          quoteItemsPromise,
          codigos.length
            ? prisma.product.findMany({ where: { code: { in: codigos } }, select: { id: true, code: true } })
            : Promise.resolve([]),
        ]);
        const cotizacion = quoteItems.map((q) => ({ id: q.id, productId: q.productId, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle }));
        const idPorCodigo = new Map(combos.flatMap((c) => (c.code ? [[c.code, c.id] as const] : [])));
        const duenios = new Map(
          order.items.map((item) => [item.id, duenioDePartes(item, lineaFuente(item, cotizacion), idPorCodigo)] as const),
        );
        const partes = await partesPorProducto(prisma, [...duenios.values()]);
        for (const [itemId, duenio] of duenios) result.set(itemId, partes.get(duenio) ?? []);
        return result;
      })(),
      // Guia Magilus: datos sugeridos para el check "Crear guia Magilus" del modal de despacho.
      isPurchase
        ? Promise.resolve(null)
        : resolveCityFromClient(order.client?.city, order.client?.department).then(async (destination) => ({
            destination,
            collect: await computeCollectSuggestion(order.saleId, destination?.id),
          })),
      // Historial de fechas (despachos y OF): bitácora con el prefijo, más nuevo primero, por código.
      prisma.activityLog.findMany({
        where: { entityType: "ORDER", entityId: order.id, summary: { startsWith: PREFIJO_CAMBIO_FECHA } },
        orderBy: { createdAt: "desc" },
        select: { id: true, entityCode: true, summary: true, actorName: true, createdAt: true },
      }),
      isPurchase
        ? Promise.resolve(null)
        : Promise.all([
            // Avisos de cambio de color de cada OF (nov-2026): los sin ver y, si no hay, el último visto.
            ensureManufacturingOrders(order.id, manufacturingSupplierIds).then(async (manufacturingOrders) => ({
              manufacturingOrders,
              avisosColor: await prisma.avisoColorOF.findMany({
                where: { manufacturingOrderId: { in: manufacturingOrders.map((of) => of.id) } },
                orderBy: { createdAt: "asc" },
                select: { id: true, manufacturingOrderId: true, producto: true, colorViejo: true, colorNuevo: true, createdAt: true, vistoEn: true },
              }),
            })),
            getSystemBrandName(),
            getManufacturingPayments(order.id, manufacturingSupplierIds, lineSubtotalsBySupplier),
            prisma.activityLog.findFirst({
              where: { entityType: "ORDER", entityId: order.id, summary: { startsWith: ORDEN_COMBO_CREADA_SOLA } },
              select: { id: true },
            }),
            quoteItemsPromise,
            getComboCamillasSupplierId(),
          ]),
    ]);

  const returnTo = `/admin/ordenes/${order.id}`;
  // Costo total de compra de la orden. Para stock usa el costo real de inventario
  // (costo + envio/flete del producto); para fabricacion, el costo confirmado.
  const totalPurchaseCost = order.items.reduce((sum, item) => {
    const preferred = item.product.suppliers[0];
    const unitCost = computeItemUnitCost({
      purchaseCost: item.purchaseCost === null ? null : Number(item.purchaseCost),
      fulfillmentMode: item.fulfillmentMode,
      baseCost: Number(item.product.baseCost),
      additionalCost: Number(item.product.additionalCost),
      preferredSupplierCost: preferred?.supplierCost != null ? Number(preferred.supplierCost) : null,
    });
    return sum + unitCost * item.quantity;
  }, 0);
  // Costo de envio pagado al proveedor de transporte (registrado en la venta).
  // Debe restarse de la ganancia, igual que en el modulo de balances.
  const totalShippingCost = (order.sale?.shippingCosts ?? []).reduce(
    (sum, cost) => sum + Number(cost.amount),
    0,
  );
  const earnedValue = Number(order.total) - totalPurchaseCost - totalShippingCost;
  // Un producto de stock ya esta en bodega: no pasa por proveedor, pago ni
  // recogido (foto). Solo los de fabricacion requieren ese flujo.
  const needsSupplierFlow = (item: (typeof order.items)[number]) =>
    item.fulfillmentMode !== "STOCK";
  // En una compra el item ya viene comprado (se confirma al registrarla, aunque
  // no tenga proveedor); en una venta hay que confirmar proveedor + costo. Para
  // stock basta con que se haya confirmado (descontado del inventario).
  const itemIsConfirmed = (item: (typeof order.items)[number]) =>
    isPurchase || !needsSupplierFlow(item)
      ? item.confirmedAt !== null
      : Boolean(item.confirmedSupplierId) && item.purchaseCost !== null;
  const allItemsConfirmed = order.items.length > 0 && order.items.every(itemIsConfirmed);
  const allItemsHavePhotos =
    order.items.length > 0 &&
    order.items.every((item) => !needsSupplierFlow(item) || item.photos.length > 0);
  const allItemsPaymentSet =
    order.items.length > 0 &&
    order.items.every((item) => !needsSupplierFlow(item) || item.supplierPaymentStatus !== null);
  const canDispatch = allItemsConfirmed && allItemsHavePhotos && allItemsPaymentSet;

  const latestDispatch = order.dispatches[0] ?? null;

  // Despacho por producto: un item esta despachado si pertenece a un despacho
  // activo (no cancelado ni devuelto). La orden pasa a "Despachada" solo cuando
  // todos los productos estan despachados.
  const dispatchByItemId = new Map<
    string,
    { code: string; carrierName: string | null; status: string; deliveryReversedAt: Date | null }
  >();
  for (const dispatch of order.dispatches) {
    if (dispatch.status === "CANCELLED" || dispatch.status === "RETURNED") {
      continue;
    }
    for (const dispatchItem of dispatch.items) {
      if (!dispatchByItemId.has(dispatchItem.orderItemId)) {
        dispatchByItemId.set(dispatchItem.orderItemId, {
          code: dispatch.code,
          carrierName: dispatch.carrierName,
          status: dispatch.status,
          deliveryReversedAt: dispatchItem.deliveryReversedAt,
        });
      }
    }
  }
  const isItemDespachado = (item: (typeof order.items)[number]) => dispatchByItemId.has(item.id);

  const step1Done = allItemsConfirmed;
  const step2Done = allItemsPaymentSet && allItemsHavePhotos;
  const step3Done = order.items.length > 0 && order.items.every((item) => isItemDespachado(item));
  // Con varios despachos no basta el último: todos los productos despachados y todo despacho entregado.
  const dispatchesForDelivery = order.dispatches.map((dispatch) => ({
    id: dispatch.id,
    status: dispatch.status,
    createdAt: dispatch.createdAt,
    itemCount: dispatch.items.length,
  }));
  const step4Done =
    order.status === "COMPLETED" ||
    isOrderDeliveryDone({ allItemsDispatched: step3Done, dispatches: dispatchesForDelivery });
  // «Registrar entrega» toma el primer despacho sin entregar.
  const deliveryDispatchId = dispatchToDeliver(dispatchesForDelivery);
  const deliveryDispatch = order.dispatches.find((dispatch) => dispatch.id === deliveryDispatchId) ?? null;
  const reversedItems = countReversedItems(
    order.dispatches.flatMap((dispatch) =>
      dispatch.items.map((dispatchItem) => ({
        orderItemId: dispatchItem.orderItemId,
        dispatchStatus: dispatch.status,
        deliveryReversedAt: dispatchItem.deliveryReversedAt,
      })),
    ),
  );
  // Devoluciones: abiertas = sin cerrar ni anular; las anuladas no cuentan para nada.
  const openReturns = order.returns.filter(estaAbierta);
  const returnDisplay = estadoDevolucionDeOrden({
    orderItems: order.items.map((item) => ({ id: item.id, quantity: item.quantity })),
    devueltasAbiertas: openReturns.flatMap((r) => r.items),
    despachos: order.dispatches.map((d) => ({ id: d.id, status: d.status, orderItemIds: d.items.map((i) => i.orderItemId) })),
    despachosConDevolucion: order.returns.flatMap((r) => (r.annulledAt === null && r.dispatchId ? [r.dispatchId] : [])),
  });
  const displayState = getOrderDisplayState(
    order.status,
    latestDispatch
      ? { deliveryType: latestDispatch.deliveryType, status: latestDispatch.status }
      : null,
    reversedItems,
    returnDisplay,
  );
  const moneyWarning = reversalMoneyWarning({
    paymentMethod: order.sale?.paymentMethod,
    orderStatus: order.status,
    reversedItems,
    openReturns: openReturns.length,
  });
  // «Registrar devolución»: despachos que ya salieron y aún tienen unidades por devolver.
  const itemNameById = new Map(order.items.map((item) => [item.id, item.product.name]));
  const orderLines = order.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity }));
  const returnOption = (input: {
    id: string;
    dispatchId: string | null;
    label: string;
    status: DispatchStatusKey | null;
    carrierSupplierId: string | null;
    carrierName: string | null;
    salieron: { orderItemId: string; quantity: number }[];
  }): ReturnDispatchOption | null => {
    const devueltasAntes = openReturns.filter((r) => r.dispatchId === input.dispatchId).flatMap((r) => r.items);
    const lines = pendientesPorDevolver(input.salieron, devueltasAntes).map((line) => ({
      orderItemId: line.orderItemId,
      name: itemNameById.get(line.orderItemId) ?? "Producto",
      max: line.quantity,
    }));
    return lines.length > 0 ? { ...input, devueltasAntes, lines } : null;
  };
  const liveDispatches = order.dispatches.some((d) => d.status !== "CANCELLED" && d.status !== "RETURNED");
  const returnOptions: ReturnDispatchOption[] =
    order.type !== "SALE" || order.status === "CANCELLED"
      ? []
      : [
          ...order.dispatches
            .filter((d) => d.status === "SHIPPED" || d.status === "DELIVERED" || d.status === "RETURNED")
            .map((d) =>
              returnOption({
                id: d.id,
                dispatchId: d.id,
                label: `${displayCode(d.code)} · ${getDispatchStatusLabel(d.status)}`,
                status: d.status,
                carrierSupplierId: d.carrierSupplierId,
                carrierName: d.carrierName,
                salieron: d.items.length > 0 ? d.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) : orderLines,
              }),
            ),
          // Sin despacho: solo una orden que ya salió y sin despachos vivos (mismo criterio del servidor).
          (order.status === "DISPATCHED" || order.status === "COMPLETED") && !liveDispatches
            ? returnOption({
                id: "SIN_DESPACHO",
                dispatchId: null,
                label: "Sin despacho",
                status: null,
                carrierSupplierId: null,
                carrierName: null,
                salieron: orderLines,
              })
            : null,
        ].filter((option): option is ReturnDispatchOption => option !== null);
  const seller = order.sale?.quote?.createdBy ?? null;
  const sellerName = seller ? seller.name || seller.email : null;
  const sellerWhatsApp = seller ? whatsAppDigits(seller.phone || seller.teamMember?.phone) : "";
  const returnViews = order.returns.map((r) => {
    const dispatch = r.dispatchId ? order.dispatches.find((d) => d.id === r.dispatchId) ?? null : null;
    const loss = perdidaDevolucion({
      despacho: dispatch
        ? {
            shippingCost: dispatch.shippingCost,
            lineas: dispatch.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, shippingCost: i.shippingCost })),
          }
        : null,
      devueltas: r.items,
      returnFreight: r.returnFreight,
    });
    const motive = r.reason === "OTRO" && r.reasonText ? `Otro: ${r.reasonText}` : returnReasonLabel(r.reason);
    const products = r.items.map((i) => `${i.orderItem.product.name} × ${i.quantity}`);
    const open = estaAbierta(r);
    return {
      id: r.id,
      open,
      state: r.annulledAt ? `Anulada: ${r.annulReason ?? "sin motivo"}` : r.closedAt ? `Cerrada · ${formatNoteDate(r.closedAt)}` : "Abierta",
      edit: {
        reason: r.reason,
        reasonText: r.reasonText ?? "",
        location: r.location,
        nextStep: r.nextStep,
        comment: r.comment ?? "",
        freight: r.returnFreight === null ? "" : String(Math.round(Number(r.returnFreight))),
      },
      annulEffect:
        dispatch?.status === "RETURNED" && r.dispatchStatusBefore === "SHIPPED"
          ? "El despacho y la guía vuelven a «En camino»."
          : dispatch?.status === "DELIVERED" &&
              dispatch.items.some((i) => i.deliveryReversedAt && r.items.some((ri) => ri.orderItemId === i.orderItemId))
            ? "Los productos que esta devolución dejó como no entregados vuelven a Entregado (queda una reversa)."
            : null,
      sellerNotified: r.sellerNotifiedAt
        ? `${r.sellerNotifiedBy?.name || r.sellerNotifiedBy?.email || "Sin nombre"} · ${formatNoteDate(r.sellerNotifiedAt)}`
        : null,
      // Aviso a la asesora: solo en abiertas sin avisar y si la venta tiene asesora.
      seller:
        open && !r.sellerNotifiedAt && sellerName
          ? {
              name: sellerName,
              whatsApp: sellerWhatsApp,
              message: mensajeDevolucionAsesora({
                asesora: sellerName,
                orden: displayCode(order.code),
                venta: order.sale ? displayCode(order.sale.code) : null,
                cliente: order.client?.name || order.client?.email || "Sin dato",
                productos: products,
                motivo: motive,
                dondeEsta: returnLocationLabel(r.location),
                queSigue: returnNextStepLabel(r.nextStep),
              }),
            }
          : null,
      history: returnLogs
        .filter((log) => (log.after as { devolucion?: unknown } | null)?.devolucion === r.id)
        .map((log) => ({ id: log.id, text: log.summary, by: log.actorName, date: formatNoteDate(log.createdAt) })),
      date: shortColombiaDate(r.returnDate),
      dispatchCode: dispatch ? displayCode(dispatch.code) : null,
      motive,
      products,
      carrier: [r.carrierSupplier?.name, r.carrierName].filter(Boolean).join(" · ") || null,
      location: returnLocationLabel(r.location),
      nextStep: returnNextStepLabel(r.nextStep),
      comment: r.comment,
      files: r.files.map((f) => ({ ...f, pdf: f.url.toLowerCase().endsWith(".pdf") })),
      lossIda: formatMoney(loss.ida, currency),
      lossIdaNote: loss.etiquetaIda,
      lossVuelta: formatMoney(loss.vuelta, currency),
      lossTotal: formatMoney(loss.total, currency),
      by: r.createdBy.name || r.createdBy.email,
      createdAt: formatNoteDate(r.createdAt),
    };
  });

  const isItemConfirmed = itemIsConfirmed;
  // Un producto de stock confirmado queda listo para despachar (no pasa por
  // recogido). Para fabricacion, recogido = pago registrado + foto subida.
  const isItemRecogido = (item: (typeof order.items)[number]) =>
    !needsSupplierFlow(item)
      ? itemIsConfirmed(item)
      : item.supplierPaymentStatus !== null && item.photos.length > 0;
  const pendingFabricar = order.items.filter((item) => !isItemConfirmed(item)).length;
  const pendingRecoger = order.items.filter(
    (item) => isItemConfirmed(item) && !isItemRecogido(item),
  ).length;
  const pendingDespachar = order.items.filter(
    (item) => isItemConfirmed(item) && isItemRecogido(item) && !isItemDespachado(item),
  ).length;
  const itemsTitle = pendingItemsLabel({
    fabricar: pendingFabricar,
    recoger: pendingRecoger,
    despachar: pendingDespachar,
  });

  const stockExitCostById = new Map(stockExitCostEntries);
  const orderItemsData = order.items.map((item) => {
    const itemDispatch = dispatchByItemId.get(item.id);
    // Proveedores efectivos: los del producto o, si es un combo (sin proveedor
    // propio), la union de los proveedores de sus componentes (sin repetir).
    const componentSuppliers = item.product.bundleComponents.flatMap((component) => component.child.suppliers);
    const rawSuppliers = item.product.suppliers.length > 0 ? item.product.suppliers : componentSuppliers;
    const seenSupplierIds = new Set<string>();
    const effectiveSuppliers = rawSuppliers.filter((entry) => {
      if (seenSupplierIds.has(entry.supplierId)) {
        return false;
      }
      seenSupplierIds.add(entry.supplierId);
      return true;
    });
    const preferred = effectiveSuppliers[0];
    const meta = parseQuoteItemMeta(item.notes);
    const observations = [meta.description, meta.color ? `Color: ${meta.color}` : ""]
      .filter(Boolean)
      .join(" - ");
    return {
      id: item.id,
      orderId: order.id,
      productName: item.product.name,
      productCode: item.product.code,
      productImageUrl: item.product.thumbnailUrl ? getPublicAssetUrl(item.product.thumbnailUrl) : null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      fulfillmentLabel: getFulfillmentModeLabel(item.fulfillmentMode),
      observations,
      color: meta.color.trim(),
      canChangeColor,
      // La imagen que ve la proveedora: la subida a mano o, si no hay, la del catálogo.
      imagenManual: meta.imageUrl.trim() ? getPublicAssetUrl(meta.imageUrl.trim()) : null,
      partesDef: partesDeItem.get(item.id) ?? [],
      partesElegidas: meta.partes,
      isConfirmed: itemIsConfirmed(item),
      isRecogido: isItemRecogido(item),
      isDespachado: isItemDespachado(item),
      isEntregado: itemDispatch ? itemDeliveryState({ dispatchStatus: itemDispatch.status, deliveryReversedAt: itemDispatch.deliveryReversedAt }) === "ENTREGADO" : false,
      // Despacho entregado, pero a este producto se le reversó la entrega.
      isDeliveryReversed: itemDispatch?.status === "DELIVERED" && itemDispatch.deliveryReversedAt !== null,
      dispatchCode: dispatchByItemId.get(item.id)?.code ?? null,
      dispatchCarrierName: dispatchByItemId.get(item.id)?.carrierName ?? null,
      requiresManufacturing: item.fulfillmentMode !== "STOCK",
      // Para el modal de stock: precio de fabrica (costo proveedor) y el costo que se va a usar.
      factoryPrice: Number(item.product.baseCost),
      stockExitCost: stockExitCostById.get(item.id) ?? null,
      stockCostSource: item.stockCostSource,
      hasProductionJob: item.productionJobs.length > 0,
      suppliers: effectiveSuppliers.map((entry) => ({
        id: entry.supplierId,
        name: entry.supplier.name,
      })),
      defaultSupplierId: item.confirmedSupplierId ?? preferred?.supplierId ?? "",
      // "Confirmar N" usa la primera proveedora propia (no la de las piezas de un combo).
      loteSupplier: item.product.suppliers[0]
        ? { id: item.product.suppliers[0].supplierId, name: item.product.suppliers[0].supplier.name }
        : null,
      // Para un combo el costo por defecto es el costo base del combo, no el de un
      // solo componente; para un producto normal, el costo de su proveedor.
      defaultCost: Number(
        item.purchaseCost ??
          (item.product.bundleComponents.length > 0
            ? item.product.baseCost
            : preferred?.supplierCost ?? item.product.baseCost),
      ),
      confirmedSupplierName: item.confirmedSupplier?.name ?? null,
      purchaseCost: item.purchaseCost === null ? null : Number(item.purchaseCost),
      supplierCostTotal: item.purchaseCost === null ? 0 : Number(item.purchaseCost) * item.quantity,
      supplierPaidTotal: item.supplierLedgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0),
      paymentStatus:
        item.supplierPaymentStatus === "PAID"
          ? ("PAID" as const)
          : item.supplierPaymentStatus === "PENDING"
            ? ("PENDING" as const)
            : null,
      receiptUrl: item.supplierReceiptUrl,
      photos: item.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        name: photo.name,
      })),
      // Solo las aún sin despacho (las sube la proveedora en su enlace de la OF): deciden si el despacho pide fotos.
      embalajeFotos: item.embalajeFotos
        .filter((foto) => foto.dispatchId === null && foto.tipo !== "LLEGADA")
        .map(({ id, url, tipo }) => ({ id, url, tipo })),
    };
  });

  let shipmentDefaults: ShipmentDefaults | undefined;
  if (shipmentLookup) {
    const { destination, collect } = shipmentLookup;
    shipmentDefaults = {
      destination,
      saleBalance: collect.saleBalance,
      hasPhone: Boolean(phoneLast4(order.client?.phone)),
      paymentMethod: collect.paymentMethod,
      suggestedAmount: collect.amount,
      shippingFee: collect.shippingFee,
      shippingPending: collect.shippingPending,
    };
  }
  const salePaymentMethod = order.sale?.paymentMethod ?? null;
  const comboCheckProducts = order.items.map((item) => toComboCheckProduct(item.product));
  const comboWarning = contraentregaComboWarning(salePaymentMethod, comboCheckProducts);
  // El cambio de forma de pago usa la accion de ventas: solo se ofrece a quien tiene ese permiso.
  const canChangePaymentMethod = !isPurchase && Boolean(order.sale) && (moduleAccess.sales || moduleAccess.quotes);
  const canEditQuote = !isPurchase && moduleAccess.quotes;
  const saleQuote = order.sale?.quote ?? null;
  const shippingDispatches = order.dispatches.filter(
    (dispatch) => dispatch.deliveryType === "SHIPPING" && dispatch.status !== "CANCELLED",
  );
  // Tramos del envio por despacho (varios proveedores: ej. llegada a Cali + despacho al
  // cliente). El valor del envio del despacho es la suma de sus tramos.
  const shippingLegCards = shippingDispatches
    .map((dispatch) => {
      const legs = resolveDispatchLegs(
        dispatch.shippingLegs.map((leg) => ({
          position: leg.position,
          carrierSupplierId: leg.carrierSupplierId,
          carrierName: leg.carrierName,
          amount: Number(leg.amount),
          trackingNumber: leg.trackingNumber,
          note: leg.note,
        })),
        {
          carrierSupplierId: dispatch.carrierSupplierId,
          carrierName: dispatch.carrierName,
          carrierSupplierName: dispatch.carrierSupplier?.name ?? null,
          shippingCost: dispatch.shippingCost === null ? null : Number(dispatch.shippingCost),
          trackingNumber: dispatch.trackingNumber,
        },
      );
      // Pago de cada tramo (cuenta + comprobante); los despachos viejos no lo tienen.
      const paymentByPosition = new Map(
        dispatch.shippingLegs.map((leg) => [leg.position, leg.supplierPayment] as const),
      );
      return {
        id: dispatch.id,
        code: dispatch.code,
        canAddLeg: dispatch.status !== "RETURNED" && order.status !== "CANCELLED",
        legs: legs.map((leg) => ({ ...leg, payment: paymentByPosition.get(leg.position) ?? null })),
        total: sumShippingLegs(legs),
      };
    })
    .filter((card) => card.legs.length > 0);

  const historialDe = (code: string): CambioFechaView[] =>
    cambiosDeFecha
      .filter((cambio) => cambio.entityCode === code)
      .map((cambio) => ({ id: cambio.id, summary: cambio.summary, by: cambio.actorName, date: formatNoteDate(cambio.createdAt) }));
  const ahora = new Date();
  const dispatchEstimates = order.dispatches
    .filter((dispatch) => dispatch.status !== "CANCELLED")
    .map((dispatch) => ({
      id: dispatch.id,
      code: displayCode(dispatch.code),
      estado:
        dispatch.status === "RETURNED"
          ? null
          : estadoDeEntrega(
              { estimadoEn: dispatch.estimatedDeliveryAt, realEn: dispatch.deliveredAt, enCamino: dispatch.status === "SHIPPED" },
              ahora,
            ),
      realEn: dispatch.deliveredAt ? formatNoteDate(dispatch.deliveredAt) : null,
      estimadaInput: dispatch.estimatedDeliveryAt ? colombiaDateTimeInput(dispatch.estimatedDeliveryAt) : "",
      historial: historialDe(dispatch.code),
    }));

  // Franja de arriba (mismo diseño que Cotizaciones): Total, Saldo por cobrar, Valor ganado (solo admin) y Entrega prometida.
  const entregaPrometida = peorDe(
    dispatchEstimates.flatMap((d) => (d.estado && d.estado.tipo !== "SIN_FECHA" ? [d.estado] : [])),
  )?.peor;
  const saldoPorCobrar = shipmentLookup?.collect.saleBalance ?? 0;
  const headerStats: StatItem[] = [
    { label: "Total", value: formatMoney(Number(order.total), currency), icon: BadgeDollarSign },
    ...(order.sale
      ? [
          saldoPorCobrar > 0
            ? { label: "Saldo por cobrar", value: formatMoney(saldoPorCobrar, currency), icon: Wallet }
            : { label: "Saldo por cobrar", value: "Pagado", icon: Wallet, tone: "success" as const },
        ]
      : []),
    ...(!isPurchase && session.user.role === "ADMIN"
      ? [
          {
            label: "Valor ganado",
            value: formatMoney(earnedValue, currency),
            icon: TrendingUp,
            tone: "success" as const,
            helper: "Ver desglose →",
            href: `/admin/ordenes/${order.id}/ganancia`,
          },
        ]
      : []),
    {
      label: "Entrega prometida",
      value: entregaPrometida ? entregaPrometida.etiqueta : "Sin fecha",
      icon: CalendarClock,
      tone: entregaPrometida?.tipo === "ATRASADO" ? ("danger" as const) : undefined,
    },
  ];

  let manufacturingCards: ManufacturingCard[] = [];
  // OF sin recibir para el cuadro "Cancelar orden" (no se cancelan solas).
  let cancelOpenOfs: { code: string; supplierName: string; products: string; href: string }[] = [];
  // OF que ya existen, por proveedora: el cuadro de confirmar compra precarga su fecha y avisa.
  const ofsPorProveedora: Record<string, OfDeProveedora> = {};
  let brandName = "";
  if (manufacturingData) {
    const [{ manufacturingOrders, avisosColor }, systemBrandName, manufacturingPayments, logCreadaSola, quoteItems, comboSupplierId] =
      manufacturingData;
    // Combo Camillas: aviso para mandarle el link a Laura (nunca se le manda solo).
    const ordenCombo = Boolean(logCreadaSola) || itemsParaPlan(quoteItems).some(esComboCamillas);
    brandName = systemBrandName;
    const suggestedAddress = suggestDeliveryAddress(order.client);

    cancelOpenOfs = openManufacturingOrders(manufacturingOrders).map((of) => {
      const ofItems = manufacturingItems.filter((item) => item.confirmedSupplierId === of.supplierId);
      const ofSupplier = ofItems[0]?.confirmedSupplier ?? null;
      return {
        code: displayCode(of.code),
        supplierName: ofSupplier?.displayName || ofSupplier?.name || "Proveedora",
        products: ofItems.map((item) => `${item.product.name} x${item.quantity}`).join(", "),
        href: `/fabricacion/${of.shareToken}`,
      };
    });

    manufacturingCards = manufacturingOrders.map((manufacturingOrder) => {
      const supplierItems = manufacturingItems.filter(
        (item) => item.confirmedSupplierId === manufacturingOrder.supplierId,
      );
      const supplier = supplierItems[0]?.confirmedSupplier ?? null;
      const supplierWhatsApp = whatsAppDigits(supplier?.phone);

      const avisos = avisosColor.filter((aviso) => aviso.manufacturingOrderId === manufacturingOrder.id);
      const ultimoVisto = avisos.findLast((aviso) => aviso.vistoEn);
      const supplierName = supplier?.displayName || supplier?.name || "Proveedora";
      ofsPorProveedora[manufacturingOrder.supplierId] = {
        code: manufacturingOrder.code,
        supplierName,
        dia: manufacturingOrder.estimatedDeliveryAt ? todayInColombia(manufacturingOrder.estimatedDeliveryAt) : null,
      };

      return {
        id: manufacturingOrder.id,
        code: manufacturingOrder.code,
        avisosSinVer: avisos
          .filter((aviso) => !aviso.vistoEn)
          .map((aviso) => ({
            id: aviso.id,
            producto: aviso.producto,
            colorViejo: aviso.colorViejo,
            colorNuevo: aviso.colorNuevo,
            fecha: fechaAviso(aviso.createdAt),
          })),
        ultimoVistoEl: ultimoVisto?.vistoEn ? fechaAviso(ultimoVisto.vistoEn) : null,
        supplierName,
        supplierWhatsApp,
        // Solo el texto llega al cliente; los ítems se quedan en el servidor.
        fabricationText: buildFabricationCopyText({
          orderCode: order.code,
          saleCode: order.sale?.code ?? null,
          ofCode: manufacturingOrder.code,
          supplierId: manufacturingOrder.supplierId,
          supplierName,
          estimatedDeliveryAt: manufacturingOrder.estimatedDeliveryAt,
          ofNotes: manufacturingOrder.notes,
          items: manufacturingItems,
        }),
        url: getSiteUrl(`/of/${manufacturingOrder.code}`),
        estimadaInput: manufacturingOrder.estimatedDeliveryAt
          ? colombiaDateTimeInput(manufacturingOrder.estimatedDeliveryAt)
          : "",
        realInput: manufacturingOrder.receivedAt ? colombiaDateTimeInput(manufacturingOrder.receivedAt) : "",
        realTexto: manufacturingOrder.receivedAt ? formatNoteDate(manufacturingOrder.receivedAt) : null,
        // Solo ayuda: la fecha vieja no se copia a la estimada (la OF sigue "Sin fecha").
        fechaAnterior: manufacturingOrder.deliveryDate ? manufacturingOrder.deliveryDate.toISOString().slice(0, 10) : "",
        estado: estadoDeEntrega(
          { estimadoEn: manufacturingOrder.estimatedDeliveryAt, realEn: manufacturingOrder.receivedAt, enCamino: false },
          ahora,
        ),
        historial: historialDe(manufacturingOrder.code),
        deliveryAddress: manufacturingOrder.deliveryAddress ?? suggestedAddress,
        notes: manufacturingOrder.notes ?? "",
        totalCost: supplierItems.reduce(
          (sum, item) => sum + (item.purchaseCost == null ? 0 : Number(item.purchaseCost) * item.quantity),
          0,
        ),
        hasMissingCost: supplierItems.some((item) => item.purchaseCost == null),
        units: supplierItems.reduce((sum, item) => sum + item.quantity, 0),
        pago: manufacturingPayments.get(manufacturingOrder.supplierId) ?? null,
        creadaSolaParaLaura:
          ordenCombo &&
          supplier !== null &&
          (supplier.id === comboSupplierId || (!comboSupplierId && esLaura(supplier))),
        lines: supplierItems.map((item) => ({
          id: item.id,
          name: item.product.name,
          code: item.product.code,
          quantity: item.quantity,
        })),
      };
    });
  }

  // Orden cancelada: franja roja con la última cancelación y sin botones de Fabricar, Recoger ni Despachar.
  const isCancelled = order.status === "CANCELLED";
  const cancellation = isCancelled ? ultimaCancelacion(order.history) : null;

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Orden actualizada"
        errorTitle="No se pudo actualizar"
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{displayCode(order.code)}</h1>
          {order.type === "PURCHASE" ? (
            <p className="text-sm text-muted-foreground">
              Compra{order.supplier ? ` a ${order.supplier.name}` : " a proveedor"}
              {order.createdBy ? ` · ${order.createdBy.name || order.createdBy.email}` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Venta{" "}
              <Link
                href={order.sale ? `/admin/ventas?q=${encodeURIComponent(order.sale.code)}` : "/admin/ventas"}
                className="font-medium text-foreground hover:underline"
              >
                {displayCode(order.sale?.code)}
              </Link>{" "}
              - Cliente {order.client?.name || order.client?.email}
            </p>
          )}
          {!isPurchase ? (
            <div className="flex flex-wrap items-center gap-2">
              {salePaymentMethod ? (
                <Badge
                  variant="outline"
                  className={PAYMENT_METHOD_BADGE[salePaymentMethod]}
                  title={PAYMENT_METHOD_LABEL[salePaymentMethod]}
                >
                  Pago: {PAYMENT_METHOD_SHORT_LABEL[salePaymentMethod]}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                  Forma de pago sin definir
                </Badge>
              )}
              {canChangePaymentMethod && order.sale ? (
                <ChangePaymentMethodButton
                  saleId={order.sale.id}
                  saleCode={displayCode(order.sale.code)}
                  returnTo={`/admin/ordenes/${order.id}`}
                  defaultValue={salePaymentMethod}
                  hasCamillaCombo={comboCheckProducts.some(isCamillaComboProduct)}
                />
              ) : null}
              <SaleOriginBadge prefix="Origen: " origin={order.sale?.origin} detail={order.sale?.originDetail} />
              {comboWarning ? <span className="text-xs text-amber-700 dark:text-amber-400">{comboWarning}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={displayState.className} variant="outline">
            {displayState.label}
          </Badge>
          <OrderActionsMenu
            orderId={order.id}
            status={order.status}
            isPurchase={order.type === "PURCHASE"}
            returnTo={returnTo}
            orderDate={toDateInputValue(order.createdAt)}
            openOfs={cancelOpenOfs}
            hasActiveDispatch={Boolean(cancelBlock(order.dispatches))}
            hasPayments={hasPayments(order.sale)}
            items={order.items.map((item, index) => ({
              id: item.id,
              name: item.product.name,
              code: item.product.code,
              quantity: item.quantity,
              fulfillmentMode: item.fulfillmentMode,
              color: orderItemsData[index].color,
              canChangeColor: orderItemsData[index].canChangeColor,
              imagenManual: orderItemsData[index].imagenManual,
              imagenCatalogo: orderItemsData[index].productImageUrl,
              partesDef: orderItemsData[index].partesDef,
              partesElegidas: orderItemsData[index].partesElegidas,
            }))}
          />
          {returnOptions.length > 0 ? (
            <OrderReturnDialog
              orderId={order.id}
              options={returnOptions}
              carriers={carriers.map((carrier) => ({ id: carrier.id, name: carrier.name }))}
              today={todayInColombia()}
            />
          ) : null}
        </div>
      </div>

      {isCancelled ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold">Cancelada</p>
            {cancellation ? (
              <>
                {cancellation.note ? <p className="break-words">{cancellation.note}</p> : null}
                <p className="text-xs">
                  {cancellation.changedBy.name || cancellation.changedBy.email} · {shortColombiaDate(cancellation.createdAt)}
                </p>
              </>
            ) : null}
            {!isPurchase ? (
              <p className="text-xs">Para seguir con ella, usa Reactivar en el menú de la orden.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {moneyWarning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {moneyWarning}
        </div>
      ) : null}

      {!isPurchase ? (
        <OrderClientCard
          name={order.client?.name}
          phone={order.client?.phone}
          instagram={order.client?.instagram}
          delivery={buildOrderDeliveryInfo(order.client, order.dispatches, {
            orderCode: order.code,
            saleCode: order.sale?.code,
          })}
          quote={
            saleQuote
              ? {
                  id: saleQuote.id,
                  code: saleQuote.code,
                  shareToken: saleQuote.shareToken,
                  notes: saleQuote.notes,
                  date: shortColombiaDate(saleQuote.createdAt),
                  by: saleQuote.createdBy.name || saleQuote.createdBy.email,
                }
              : null
          }
          canEditQuote={canEditQuote}
        />
      ) : null}

      <StatList items={headerStats} />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <Badge
              variant="outline"
              className={
                pendingFabricar > 0 || pendingRecoger > 0 || pendingDespachar > 0
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }
            >
              {itemsTitle}
            </Badge>
          </div>
          <OrderItemsTable
            key={confirmationKey(orderItemsData)}
            orderId={order.id}
            items={orderItemsData}
            currency={currency}
            returnTo={returnTo}
            accounts={accounts}
            carriers={carriers}
            defaultAddress={order.client?.address ?? ""}
            shipmentDefaults={shipmentDefaults}
            ofsPorProveedora={ofsPorProveedora}
            pideFechaFabricacion={!isPurchase}
            locked={isCancelled}
          />
        </div>

        <div className="space-y-4">
          {isCancelled ? null : (
            <OrderStepper
              step1Done={step1Done}
              step2Done={step2Done}
              step3Done={step3Done}
              step4Done={step4Done}
              returnState={returnDisplay ? displayState : null}
              dispatch={{
                orderId: order.id,
                returnTo,
                carriers,
                accounts,
                defaultAddress: order.client?.address ?? "",
                canDispatch,
                allItemsConfirmed,
                allItemsPaymentSet,
                allItemsHavePhotos,
              }}
              delivery={{
                dispatchId: deliveryDispatchId,
                returnTo,
                defaultInstagram: order.client?.instagram ?? "",
                defaultTiktok: order.client?.tiktok ?? "",
                info: {
                  orderCode: displayCode(order.code),
                  saleCode: order.sale ? displayCode(order.sale.code) : null,
                  clientName: order.client?.name || order.client?.email || null,
                  city: order.client?.city ?? null,
                  carrierName: deliveryDispatch?.carrierName ?? null,
                  trackingNumber: deliveryDispatch?.trackingNumber ?? null,
                  isContraentrega: salePaymentMethod === "CONTRAENTREGA",
                },
              }}
            />
          )}

          {shippingLegCards.length > 0 ? (
            <Card className="border-border bg-card/95">
              <CardContent className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Envío</p>
                {shippingLegCards.map((card) => (
                  <div key={card.id} className="space-y-1.5">
                    {shippingLegCards.length > 1 ? (
                      <p className="text-xs font-medium text-muted-foreground">Despacho {displayCode(card.code)}</p>
                    ) : null}
                    {card.legs.map((leg) => (
                      <div
                        key={leg.position}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border px-2.5 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{leg.carrierName}</p>
                          {leg.trackingNumber || leg.note ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {[leg.note, leg.trackingNumber ? `Guía ${leg.trackingNumber}` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                          {leg.payment ? (
                            <p className="truncate text-xs text-muted-foreground">
                              Pagado desde {leg.payment.account?.name ?? "sin cuenta"}
                              {leg.payment.receiptUrl ? (
                                <>
                                  {" · "}
                                  <a
                                    href={leg.payment.receiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    ver comprobante
                                  </a>
                                </>
                              ) : null}
                            </p>
                          ) : leg.amount > 0 ? (
                            <p className="text-xs text-amber-600">Pago sin cuenta registrada</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-medium text-foreground">{formatMoney(leg.amount, currency)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-2 text-sm">
                      <span className="font-medium text-foreground">
                        Total envío{card.legs.length > 1 ? ` (${card.legs.length} proveedores)` : ""}
                      </span>
                      <span className="font-semibold text-foreground">{formatMoney(card.total, currency)}</span>
                    </div>
                    {card.canAddLeg ? (
                      <AddShippingLegDialog
                        dispatchId={card.id}
                        dispatchCode={displayCode(card.code)}
                        returnTo={returnTo}
                        carriers={carriers}
                        accounts={accounts}
                      />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {!isPurchase && shippingDispatches.length > 0 ? (
            <Card className="border-border bg-card/95">
              <CardContent className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Guías Magilus</p>
                {shippingDispatches.map((dispatch) =>
                  dispatch.shipment ? (
                    <Link
                      key={dispatch.id}
                      href={`/admin/despachos/guias/${dispatch.shipment.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm hover:border-primary/40"
                    >
                      <span className="font-semibold text-foreground">{dispatch.shipment.code}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_BADGE[dispatch.shipment.status]}`}>
                        {SHIPMENT_STATUS_LABEL[dispatch.shipment.status]}
                      </span>
                    </Link>
                  ) : (
                    <form
                      key={dispatch.id}
                      action={adminCreateShipmentAction}
                      className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border p-2 text-sm"
                    >
                      <input type="hidden" name="dispatchId" value={dispatch.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <span className="text-muted-foreground">{displayCode(dispatch.code)} sin guía</span>
                      <span className="ml-auto flex items-center gap-2">
                        <input
                          type="text"
                          name="weightKg"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Peso kg"
                          aria-label="Peso en kg (opcional)"
                          pattern="\s*\d+([.,]\d+)?\s*"
                          title="Peso en kg, opcional (ej. 12,5)"
                          className="h-8 w-20 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Crear guía Magilus
                        </Button>
                      </span>
                    </form>
                  ),
                )}
              </CardContent>
            </Card>
          ) : null}

          <DispatchEstimateCard dispatches={dispatchEstimates} returnTo={returnTo} />

          <OrderNotesCard
            orderId={order.id}
            notes={order.noteEntries.map((note) => ({
              id: note.id,
              text: note.text,
              by: note.createdBy.name || note.createdBy.email,
              date: formatNoteDate(note.createdAt),
              mine: note.createdById === session.user.id,
            }))}
          />

          <EmbalajeFotosCard
            grupos={gruposEmbalaje(
              order.items.flatMap((item) =>
                item.embalajeFotos.map((foto) => ({ ...foto, orderItemId: item.id, producto: item.product.name })),
              ),
            )}
          />

          <OrderReturnCard orderId={order.id} returns={returnViews} />

          <OrderReversalsCard
            reversals={order.reversals.map((reversal) => ({
              id: reversal.id,
              product: reversal.orderItem?.product.name ?? "Toda la orden",
              fromState: reversal.fromState,
              toState: reversal.toState,
              motive:
                reversal.reason === "OTRO" && reversal.reasonText
                  ? `Otro: ${reversal.reasonText}`
                  : reversalReasonLabel(reversal.reason),
              comment: reversal.comment,
              by: reversal.createdBy.name || reversal.createdBy.email,
              date: formatNoteDate(reversal.createdAt),
            }))}
          />

          <Card className="border-border bg-card/95">
            <CardContent>
              <OrderHistoryTabs
                currency={currency}
                orderId={order.id}
                returnTo={returnTo}
                manufacturing={isPurchase ? undefined : { cards: manufacturingCards, brandName }}
                history={order.history.map((item) => ({
                  id: item.id,
                  fromLabel: item.fromStatus ? getOrderStatusLabel(item.fromStatus) : "Nuevo",
                  toLabel: getOrderStatusLabel(item.toStatus),
                  date: item.createdAt.toLocaleDateString("es-CO"),
                  dateValue: toDateInputValue(item.createdAt),
                  by: item.changedBy.name ?? item.changedBy.email,
                  note: item.note,
                }))}
                payments={(order.sale?.salePayments ?? []).map((payment) => ({
                  id: payment.id,
                  amount: Number(payment.amount),
                  // Retencion en la fuente: se muestra como tal, con su certificado.
                  method: payment.isWithholding ? paymentMethodLabel(payment) : (payment.paymentMethod ?? null),
                  note: payment.note ?? null,
                  paidAt: (payment.paymentDate ?? payment.createdAt).toLocaleDateString("es-CO"),
                  receiptUrl: payment.receiptUrl ?? null,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
