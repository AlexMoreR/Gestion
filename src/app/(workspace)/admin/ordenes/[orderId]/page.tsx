import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AddShippingLegDialog } from "@/components/admin/add-shipping-leg-dialog";
import { OrderActionsMenu } from "@/components/admin/order-actions-menu";
import { OrderClientCard } from "@/components/admin/order-client-card";
import { OrderHistoryTabs } from "@/components/admin/order-history-tabs";
import { EmbalajeFotosCard, gruposEmbalaje } from "@/components/admin/embalaje-fotos-card";
import { OrderNotesCard } from "@/components/admin/order-notes-card";
import { DispatchEstimateCard, type CambioFechaView } from "@/components/admin/dispatch-estimate-card";
import { colombiaDateTimeInput } from "@/lib/colombia-time";
import { estadoDeEntrega, PREFIJO_CAMBIO_FECHA } from "@/lib/delivery-tracking";
import { OrderReversalsCard } from "@/components/admin/order-reversals-card";
import { OrderItemsTable } from "@/components/admin/order-items-table";
import { OrderStepper } from "@/components/admin/order-stepper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess, hasAnyModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { resolveDispatchLegs, sumShippingLegs } from "@/lib/dispatch-shipping-legs";
import { computeStockExitCost } from "@/lib/stock-exit-cost";
import { computeItemUnitCost } from "@/lib/order-item-cost";
import { prisma } from "@/lib/prisma";
import { buildOrderDeliveryInfo, shortColombiaDate, whatsAppDigits } from "@/lib/order-delivery-info";
import { formatNoteDate } from "@/lib/order-notes";
import { dispatchToDeliver, isOrderDeliveryDone, pendingItemsLabel } from "@/lib/order-dispatch";
import { countReversedItems, itemDeliveryState, reversalMoneyWarning, reversalReasonLabel } from "@/lib/order-item-reversal";
import {
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

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
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
                createdBy: { select: { name: true, email: true } },
              },
            },
          },
        },
        client: true,
        supplier: true,
        createdBy: true,
        assignedTo: true,
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
            productionJobs: {
              include: {
                assignedTo: true,
                createdBy: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        productionJobs: {
          include: {
            assignedTo: true,
            createdBy: true,
            orderItem: {
              include: {
                product: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
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
            createdBy: true,
            items: {
              include: {
                orderItem: {
                  include: {
                    product: true,
                  },
                },
              },
            },
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
  const isPurchase = order.type === "PURCHASE";
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
  const displayState = getOrderDisplayState(
    order.status,
    latestDispatch
      ? { deliveryType: latestDispatch.deliveryType, status: latestDispatch.status }
      : null,
    reversedItems,
  );
  const moneyWarning = reversalMoneyWarning({
    paymentMethod: order.sale?.paymentMethod,
    orderStatus: order.status,
    reversedItems,
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

  // Pieza por stock sin confirmar: el costo que se va a usar (compra que la entró o catálogo).
  const stockExitCostById = new Map(
    await Promise.all(
      order.items
        .filter((item) => !isPurchase && item.fulfillmentMode === "STOCK" && item.confirmedAt === null)
        .map(async (item) => [item.id, await computeStockExitCost({ productId: item.productId, quantity: item.quantity })] as const),
    ),
  );

  // Cambiar color: solo en una venta (y su orden) no cancelada.
  const canChangeColor =
    !isPurchase && Boolean(order.sale) && order.sale?.status !== "CANCELLED" && order.status !== "CANCELLED";
  // Partes de color de cada producto (para «Cambiar color» por parte): las del combo o las del producto.
  const partesDeItem = new Map<string, ParteParaCotizar[]>();
  if (canChangeColor && order.sale) {
    const quoteItems = await prisma.quoteItem.findMany({
      where: { quoteId: order.sale.quoteId },
      select: { id: true, productId: true, notes: true, product: { select: { name: true, isBundle: true } } },
    });
    const cotizacion = quoteItems.map((q) => ({ id: q.id, productId: q.productId, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle }));
    const codigos = [...new Set(order.items.map((item) => parseQuoteItemMeta(item.notes).comboCode.trim()).filter(Boolean))];
    const combos = codigos.length
      ? await prisma.product.findMany({ where: { code: { in: codigos } }, select: { id: true, code: true } })
      : [];
    const idPorCodigo = new Map(combos.flatMap((c) => (c.code ? [[c.code, c.id] as const] : [])));
    const duenios = new Map(
      order.items.map((item) => [item.id, duenioDePartes(item, lineaFuente(item, cotizacion), idPorCodigo)] as const),
    );
    const partes = await partesPorProducto(prisma, [...duenios.values()]);
    for (const [itemId, duenio] of duenios) partesDeItem.set(itemId, partes.get(duenio) ?? []);
  }
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

  // Guia Magilus: datos sugeridos para el check "Crear guia Magilus" del modal de despacho.
  let shipmentDefaults: ShipmentDefaults | undefined;
  if (!isPurchase) {
    const destination = await resolveCityFromClient(order.client?.city, order.client?.department);
    const collect = await computeCollectSuggestion(order.saleId, destination?.id);
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
  const canChangePaymentMethod =
    !isPurchase && Boolean(order.sale) && (await hasAnyModuleAccess(session.user.id, session.user.role, ["sales", "quotes"]));
  const canEditQuote = !isPurchase && (await hasAdminModuleAccess(session.user.id, session.user.role, "quotes"));
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

  // Historial de fechas (despachos y OF): bitácora con el prefijo, más nuevo primero, por código.
  const cambiosDeFecha = await prisma.activityLog.findMany({
    where: { entityType: "ORDER", entityId: order.id, summary: { startsWith: PREFIJO_CAMBIO_FECHA } },
    orderBy: { createdAt: "desc" },
    select: { id: true, entityCode: true, summary: true, actorName: true, createdAt: true },
  });
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

  // Ordenes de fabricacion (OF) por proveedora: solo en ordenes de venta.
  let manufacturingCards: ManufacturingCard[] = [];
  let brandName = "";
  if (!isPurchase) {
    const manufacturingItems = order.items.filter(isManufacturingItem);
    const manufacturingSupplierIds = manufacturingItems.map((item) => item.confirmedSupplierId ?? "");
    // Subtotales por proveedora: el costo de la OF cuando aun no hay cargos en su cuenta.
    const lineSubtotalsBySupplier = new Map<string, Array<number | null>>();
    for (const item of manufacturingItems) {
      const supplierId = item.confirmedSupplierId ?? "";
      const subtotal = item.purchaseCost == null ? null : Number(item.purchaseCost) * item.quantity;
      lineSubtotalsBySupplier.set(supplierId, [...(lineSubtotalsBySupplier.get(supplierId) ?? []), subtotal]);
    }
    const [manufacturingOrders, systemBrandName, manufacturingPayments, logCreadaSola, quoteItems, comboSupplierId] =
      await Promise.all([
        ensureManufacturingOrders(order.id, manufacturingSupplierIds),
        getSystemBrandName(),
        getManufacturingPayments(order.id, manufacturingSupplierIds, lineSubtotalsBySupplier),
        prisma.activityLog.findFirst({
          where: { entityType: "ORDER", entityId: order.id, summary: { startsWith: ORDEN_COMBO_CREADA_SOLA } },
          select: { id: true },
        }),
        order.saleId
          ? prisma.quoteItem.findMany({
              where: { quote: { sale: { id: order.saleId } } },
              select: { quantity: true, notes: true, product: { select: { code: true } } },
            })
          : Promise.resolve([]),
        getComboCamillasSupplierId(),
      ]);
    // Avisos de cambio de color de cada OF (nov-2026): los sin ver y, si no hay, el último visto.
    const avisosColor = await prisma.avisoColorOF.findMany({
      where: { manufacturingOrderId: { in: manufacturingOrders.map((of) => of.id) } },
      orderBy: { createdAt: "asc" },
      select: { id: true, manufacturingOrderId: true, producto: true, colorViejo: true, colorNuevo: true, createdAt: true, vistoEn: true },
    });
    // Combo Camillas: aviso para mandarle el link a Laura (nunca se le manda solo).
    const ordenCombo = Boolean(logCreadaSola) || itemsParaPlan(quoteItems).some(esComboCamillas);
    brandName = systemBrandName;
    const suggestedAddress = suggestDeliveryAddress(order.client);

    manufacturingCards = manufacturingOrders.map((manufacturingOrder) => {
      const supplierItems = manufacturingItems.filter(
        (item) => item.confirmedSupplierId === manufacturingOrder.supplierId,
      );
      const supplier = supplierItems[0]?.confirmedSupplier ?? null;
      const supplierWhatsApp = whatsAppDigits(supplier?.phone);

      const avisos = avisosColor.filter((aviso) => aviso.manufacturingOrderId === manufacturingOrder.id);
      const ultimoVisto = avisos.findLast((aviso) => aviso.vistoEn);

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
        supplierName: supplier?.displayName || supplier?.name || "Proveedora",
        supplierWhatsApp,
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

        <div className="flex items-center gap-2">
          <Badge className={displayState.className} variant="outline">
            {displayState.label}
          </Badge>
          <OrderActionsMenu
            orderId={order.id}
            status={order.status}
            isPurchase={order.type === "PURCHASE"}
            returnTo={returnTo}
            orderDate={toDateInputValue(order.createdAt)}
            items={order.items.map((item) => ({
              id: item.id,
              name: item.product.name,
              code: item.product.code,
              quantity: item.quantity,
              fulfillmentMode: item.fulfillmentMode,
            }))}
          />
        </div>
      </div>

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(Number(order.total), currency)}</p>
          </CardContent>
        </Card>
        {!isPurchase && (
          <Link
            href={`/admin/ordenes/${order.id}/ganancia`}
            className="rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full cursor-pointer border-border bg-card/95 py-2 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5">
              <CardContent className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor ganado</p>
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(earnedValue, currency)}</p>
                <p className="text-[10px] text-muted-foreground">Ver desglose →</p>
              </CardContent>
            </Card>
          </Link>
        )}
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Produccion</p>
            <p className="text-lg font-semibold text-foreground">{order.productionJobs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Despachos</p>
            <p className="text-lg font-semibold text-foreground">{order.dispatches.length}</p>
          </CardContent>
        </Card>
      </div>

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
            orderId={order.id}
            items={orderItemsData}
            currency={currency}
            returnTo={returnTo}
            accounts={accounts}
            carriers={carriers}
            defaultAddress={order.client?.address ?? ""}
            shipmentDefaults={shipmentDefaults}
          />
        </div>

        <div className="space-y-4">
          <OrderStepper
            step1Done={step1Done}
            step2Done={step2Done}
            step3Done={step3Done}
            step4Done={step4Done}
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
