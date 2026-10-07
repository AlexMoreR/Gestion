import { roundMoney } from "../../../lib/pricing";
import {
  getDashboardMetricsUseCase,
  getProfitReportUseCase,
} from "../../balances/application/use-cases";
import type { DateRange, SaleProfit } from "../../balances/domain/entities";
import type { BalancesRepository } from "../../balances/domain/repository";
import {
  buildDayRange,
  buildMonthRange,
  computeCommissions,
  COMMISSION_FIRST_SALE_RATE,
  COMMISSION_NEXT_SALES_RATE,
  describeRange,
  formatDay,
  isQuoteApproved,
  percentage,
  productMargin,
  QUOTE_STATUS_FILTERS,
  QUOTE_STATUS_LABELS,
  type QuoteStatusFilter,
  summarizeMonth,
  summarizeQuotes,
  UNASSIGNED_SELLER,
} from "../domain/calculations";
import type { AsesorReadRepository } from "../domain/repository";
import { effectiveOrigin, originDetailSummary, saleOriginLabel } from "../../ventas/domain/sale-origin";

export type AsesorDependencies = {
  balances: BalancesRepository;
  asesor: AsesorReadRepository;
};

const CURRENCY = "COP";

// Mismo criterio que Balances y el informe mensual.
const SALES_CRITERIA =
  "Ventas pagadas por completo (facturadas) con su orden entregada, reconocidas en el mes/fecha de ENTREGA. Es el mismo criterio de Balances.";

const SELLER_NOTE =
  "No existe un campo 'vendedora' en el sistema: se toma como vendedora a quien creo la cotizacion. 'registrada_por' es quien convirtio la cotizacion en venta.";

// Todas las ventas reconocidas en el rango, con su ganancia real (Balances).
async function listRecognizedSales(balances: BalancesRepository, period: DateRange): Promise<SaleProfit[]> {
  const rows: SaleProfit[] = [];
  const pageSize = 500;
  for (let page = 1; ; page += 1) {
    const result = await getProfitReportUseCase(balances, { page, pageSize, period });
    rows.push(...result.items);
    if (page >= result.pageCount) break;
  }
  return rows.sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.saleCode.localeCompare(right.saleCode),
  );
}

export async function getMonthSummaryUseCase(deps: AsesorDependencies, mes: number, anio: number) {
  const period = buildMonthRange(mes, anio);
  const metrics = await getDashboardMetricsUseCase(deps.balances, period);
  return {
    mes,
    anio,
    periodo: describeRange(period),
    moneda: CURRENCY,
    criterio: SALES_CRITERIA,
    ...summarizeMonth(metrics),
    notas: [
      "contribucion = ingresos - costo_producto - fletes; contribucion_pct = contribucion / ingresos.",
      "No incluye gastos operativos (nomina, arriendo, marketing).",
    ],
  };
}

export async function listSalesUseCase(deps: AsesorDependencies, desde: string, hasta: string) {
  const period = buildDayRange(desde, hasta);
  const rows = await listRecognizedSales(deps.balances, period);
  const details = await deps.asesor.getSaleDetails(rows.map((row) => row.saleId));
  const detailById = new Map(details.map((detail) => [detail.saleId, detail]));

  const ventas = rows.map((row) => {
    const detail = detailById.get(row.saleId);
    return {
      venta: row.saleCode,
      cotizacion: detail?.quoteCode ?? null,
      orden: detail?.orderCode ?? null,
      fecha_entrega: formatDay(row.createdAt),
      fecha_venta: detail ? formatDay(detail.saleDate) : null,
      cliente: row.clientName ?? detail?.clientName ?? null,
      productos: detail?.products ?? [],
      total: roundMoney(row.saleAmount),
      costo_producto: roundMoney(row.supplierCosts),
      flete: roundMoney(row.shippingCosts),
      ganancia: roundMoney(row.netProfit),
      margen_pct: roundMoney(row.marginPercentage),
      vendedora: detail?.seller?.name ?? UNASSIGNED_SELLER,
      registrada_por: detail?.registeredBy?.name ?? null,
      // Etiqueta legible ("Meta Ads", "Sin dato"...) + el codigo para filtrar + anuncio/cuenta si hay.
      origen: saleOriginLabel(detail?.origin ?? null),
      origen_codigo: effectiveOrigin(detail?.origin ?? null),
      origen_detalle: originDetailSummary(detail?.originDetail ?? null),
    };
  });

  const total = rows.reduce((sum, row) => sum + row.saleAmount, 0);
  const profit = rows.reduce((sum, row) => sum + row.netProfit, 0);

  return {
    periodo: describeRange(period),
    moneda: CURRENCY,
    criterio: SALES_CRITERIA,
    ventas,
    totales: {
      ventas: rows.length,
      total: roundMoney(total),
      costo_producto: roundMoney(rows.reduce((sum, row) => sum + row.supplierCosts, 0)),
      flete: roundMoney(rows.reduce((sum, row) => sum + row.shippingCosts, 0)),
      ganancia: roundMoney(profit),
      margen_pct: percentage(profit, total),
    },
    notas: [
      SELLER_NOTE,
      "'origen' sale de la linea de WhatsApp del chat en el CRM (Ventas 1 = Meta Ads, Ventas 2 = Marketplace, Admin = Referido, o Recurrente si ya habia comprado); venta directa = Mostrador. 'Sin dato' = la venta no tiene origen registrado (casi todas las anteriores a oct-2026). 'origen_detalle' trae el anuncio o la cuenta MK cuando el CRM los conoce.",
      "No incluye ventas pendientes de pago o de entrega.",
    ],
  };
}

export async function listQuotesUseCase(
  deps: AsesorDependencies,
  desde: string,
  hasta: string,
  estado: QuoteStatusFilter,
) {
  const period = buildDayRange(desde, hasta);
  const rows = await deps.asesor.listQuotes(period, QUOTE_STATUS_FILTERS[estado]);

  return {
    periodo: describeRange(period),
    estado,
    moneda: CURRENCY,
    ...summarizeQuotes(rows),
    cotizaciones: rows.map((quote) => ({
      cotizacion: quote.quoteCode,
      fecha: formatDay(quote.createdAt),
      cliente: quote.clientName,
      estado: QUOTE_STATUS_LABELS[quote.status],
      total: roundMoney(quote.total),
      vendedora: quote.seller?.name ?? UNASSIGNED_SELLER,
      aprobada: isQuoteApproved(quote),
      venta: quote.saleCode,
    })),
    notas: [
      "Se filtran por fecha de creacion de la cotizacion.",
      "Aprobada = la cotizacion se convirtio en venta (el sistema la marca 'Aceptada').",
      "pct_cierre = aprobadas / hechas dentro del filtro aplicado.",
    ],
  };
}

export async function listProductsUseCase(deps: AsesorDependencies, busqueda: string | undefined, incluirOcultos: boolean) {
  const rows = await deps.asesor.listProducts(busqueda);
  const productos = rows
    .filter((product) => incluirOcultos || !product.hiddenFromStore)
    .map((product) => ({
      codigo: product.code,
      nombre: product.name,
      categoria: product.categoryName,
      precio: roundMoney(product.price),
      costo: roundMoney(product.baseCost),
      flete: roundMoney(product.additionalCost),
      ...productMargin(product),
      es_combo: product.isBundle,
      oculto_en_tienda: product.hiddenFromStore,
    }));

  return {
    moneda: CURRENCY,
    total_productos: productos.length,
    productos,
    notas: [
      "costo = costo de catalogo; flete = 'Envio/Flete' por unidad de la ficha del producto.",
      "margen_sobre_precio_pct = ganancia_unitaria / precio; margen_sobre_costo_pct = ganancia_unitaria / costo_total (como lo muestra el catalogo).",
      "El flete de envio al cliente se registra por venta (no por producto) y por eso no aparece aqui; si esta en listar_ventas.",
      "El costo real de una venta puede variar: se usa el costo confirmado con la proveedora en la orden.",
    ],
  };
}

export async function getMonthlyCommissionsUseCase(deps: AsesorDependencies, mes: number, anio: number) {
  const period = buildMonthRange(mes, anio);
  const rows = await listRecognizedSales(deps.balances, period);
  const details = await deps.asesor.getSaleDetails(rows.map((row) => row.saleId));
  const detailById = new Map(details.map((detail) => [detail.saleId, detail]));

  const report = computeCommissions(
    rows.map((row) => ({
      saleCode: row.saleCode,
      deliveredAt: row.createdAt,
      seller: detailById.get(row.saleId)?.seller ?? null,
      profit: row.netProfit,
    })),
  );

  return {
    mes,
    anio,
    periodo: describeRange(period),
    moneda: CURRENCY,
    criterio: SALES_CRITERIA,
    regla: `${COMMISSION_FIRST_SALE_RATE * 100}% de la ganancia en la primera venta del mes de cada vendedora y ${
      COMMISSION_NEXT_SALES_RATE * 100
    }% de la segunda en adelante, en orden de fecha de entrega.`,
    ...report,
    notas: [
      SELLER_NOTE,
      "Una venta con ganancia cero o negativa cuenta como venta del mes pero no genera comision.",
    ],
  };
}
