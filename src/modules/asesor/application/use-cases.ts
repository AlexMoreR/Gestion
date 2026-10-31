import { roundMoney } from "../../../lib/pricing";
import { summarizeSupplierDebt } from "../../../lib/supplier-debt";
import {
  getDashboardMetricsUseCase,
  getProfitReportUseCase,
} from "../../balances/application/use-cases";
import type { DateRange, SaleProfit } from "../../balances/domain/entities";
import type { BalancesRepository } from "../../balances/domain/repository";
import {
  buildDayRange,
  buildCommissionsBoard,
  buildMonthRange,
  type CommissionFixedRates,
  computeCommissions,
  computeRealProfit,
  filterExpensesByCategory,
  summarizeExpensesByCategory,
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
  AsesorInputError,
} from "../domain/calculations";
import {
  bogotaDay,
  buildSaleLedger,
  describeLedgerDates,
  describePayment,
  matchesPaymentStatus,
  matchesText,
  normalizeSaleCode,
  type PaymentStatusFilter,
  type SaleLedger,
} from "../domain/payments";
import type { AsesorReadRepository } from "../domain/repository";
import { effectiveOrigin, originDetailSummary, saleOriginLabel } from "../../ventas/domain/sale-origin";

export type AsesorDependencies = {
  balances: BalancesRepository;
  asesor: AsesorReadRepository;
  // Comisiones fijas pactadas por persona (Nomina). Sin esto, todas usan la regla general.
  loadFixedCommissionRates?: (mes: number, anio: number) => Promise<CommissionFixedRates>;
};

async function fixedRatesFor(deps: AsesorDependencies, mes: number, anio: number): Promise<CommissionFixedRates> {
  return deps.loadFixedCommissionRates ? deps.loadFixedCommissionRates(mes, anio) : {};
}

const CURRENCY = "COP";

// Mismo criterio que Balances y el informe mensual.
const SALES_CRITERIA =
  "Ventas pagadas por completo (facturadas), aunque falte entregarlas, reconocidas en la fecha en que quedaron pagadas. Contraentrega: solo con la orden entregada, en la fecha de entrega. Es el mismo criterio de Balances.";

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

export type PayrollTotals = { base: number; commission: number; incomplete: boolean };

// Gastos del mes (por fecha de gasto) con total por categoria y la ganancia real del mes:
// ventas - producto - flete - comisiones - sueldos basicos - gastos (sin pagos de Nomina).
export async function listExpensesUseCase(
  deps: AsesorDependencies,
  mes: number,
  anio: number,
  categoria: string | undefined,
  loadPayrollTotals: () => Promise<PayrollTotals>,
) {
  const period = buildMonthRange(mes, anio);
  const [metrics, allExpenses, payroll] = await Promise.all([
    getDashboardMetricsUseCase(deps.balances, period),
    deps.asesor.listExpenses(period),
    loadPayrollTotals(),
  ]);
  const expenses = filterExpensesByCategory(allExpenses, categoria);
  const realProfit = computeRealProfit({
    contribution: metrics.netProfit,
    commissions: payroll.commission,
    baseSalaries: payroll.base,
    expenses: allExpenses,
  });
  return {
    mes,
    anio,
    periodo: describeRange(period),
    moneda: CURRENCY,
    categoria_filtrada: categoria?.trim() || null,
    total_gastos: roundMoney(expenses.reduce((sum, line) => sum + line.amount, 0)),
    por_categoria: summarizeExpensesByCategory(expenses),
    gastos: expenses.map((line) => ({
      id: line.id,
      fecha: formatDay(line.date),
      categoria: line.category,
      cuenta: line.account,
      monto: roundMoney(line.amount),
      nota: line.note,
      persona: line.person,
      con_foto: line.hasReceipt,
    })),
    ganancia_real: {
      ...summarizeMonth(metrics),
      ...realProfit,
      nomina_incompleta: payroll.incomplete,
      formula:
        "ganancia_real = contribucion (ventas - producto - flete) - comisiones del mes - sueldos basicos del mes - gastos sin nomina.",
    },
    notas: [
      "La ganancia real usa todos los gastos del mes, aunque se filtre por categoria; el filtro solo cambia la lista y el total_gastos.",
      "Los pagos de Nomina no se restan como gasto: la nomina ya entra como comisiones + sueldos basicos del tablero de Nomina (restarlos de nuevo contaria dos veces). Se muestran aparte en pagos_de_nomina_registrados.",
      "nomina_incompleta = true si a alguien le falta el basico por calcular (dias trabajados o TRM): la ganancia real queda sobreestimada.",
      "Las comisiones del mes en curso siguen subiendo mientras haya ventas.",
    ],
  };
}

const PAYMENT_DATES_NOTE =
  "fecha_cotizacion, fecha_creacion_venta, fecha_primer_abono, fecha_pago_completo y fecha_entrega van en dia de Colombia. pagado y saldo_pendiente son de HOY (no a la fecha del rango).";

async function loadLedgers(deps: AsesorDependencies, filter?: { saleIds?: string[]; saleCodes?: string[] }) {
  const inputs = await deps.asesor.listSaleLedgers(filter);
  return inputs.map(buildSaleLedger);
}

export async function listSalesUseCase(
  deps: AsesorDependencies,
  desde: string,
  hasta: string,
  estadoPago: PaymentStatusFilter = "pagadas",
) {
  const period = buildDayRange(desde, hasta);
  const range = describeRange(period);

  // Pagadas: mismo criterio y ganancia de Balances (como siempre).
  const rows = estadoPago === "pendientes" ? [] : await listRecognizedSales(deps.balances, period);

  // Pendientes: abono(s) pero todavia no cuentan en Balances; se filtran por fecha del primer abono.
  const pendingLedgers =
    estadoPago === "pagadas"
      ? []
      : (await loadLedgers(deps)).filter((ledger) => {
          if (!matchesPaymentStatus(ledger, "pendientes")) return false;
          const day = bogotaDay(ledger.firstPaymentAt ?? ledger.input.saleCreatedAt);
          return day >= range.desde && day <= range.hasta;
        });

  const saleIds = [...rows.map((row) => row.saleId), ...pendingLedgers.map((ledger) => ledger.input.saleId)];
  const [details, paidLedgers] = await Promise.all([
    deps.asesor.getSaleDetails(saleIds),
    rows.length > 0 ? loadLedgers(deps, { saleIds: rows.map((row) => row.saleId) }) : Promise.resolve([] as SaleLedger[]),
  ]);
  const detailById = new Map(details.map((detail) => [detail.saleId, detail]));
  const ledgerById = new Map(
    [...paidLedgers, ...pendingLedgers].map((ledger) => [ledger.input.saleId, ledger] as const),
  );

  const describeOrigin = (saleId: string) => {
    const detail = detailById.get(saleId);
    return {
      vendedora: detail?.seller?.name ?? UNASSIGNED_SELLER,
      registrada_por: detail?.registeredBy?.name ?? null,
      // Etiqueta legible ("Meta Ads", "Sin dato"...) + el codigo para filtrar + anuncio/cuenta si hay.
      origen: saleOriginLabel(detail?.origin ?? null),
      origen_codigo: effectiveOrigin(detail?.origin ?? null),
      origen_detalle: originDetailSummary(detail?.originDetail ?? null),
      origen_producto: detail?.productSource ?? null,
    };
  };

  const paidSales = rows.map((row) => {
    const detail = detailById.get(row.saleId);
    const ledger = ledgerById.get(row.saleId);
    return {
      venta: row.saleCode,
      estado_pago: "pagada",
      cotizacion: detail?.quoteCode ?? null,
      orden: detail?.orderCode ?? null,
      fecha: formatDay(row.createdAt),
      entregada: !row.pendingDelivery,
      fecha_venta: detail ? formatDay(detail.saleDate) : null,
      cliente: row.clientName ?? detail?.clientName ?? null,
      productos: detail?.products ?? [],
      total: roundMoney(row.saleAmount),
      costo_producto: roundMoney(row.supplierCosts),
      flete: roundMoney(row.shippingCosts),
      ganancia: roundMoney(row.netProfit),
      margen_pct: roundMoney(row.marginPercentage),
      ...describeOrigin(row.saleId),
      ...(ledger ? describeLedgerDates(ledger) : {}),
    };
  });

  const pendingSales = pendingLedgers.map((ledger) => {
    const detail = detailById.get(ledger.input.saleId);
    return {
      venta: ledger.input.saleCode,
      estado_pago: "pendiente",
      cotizacion: ledger.input.quoteCode,
      orden: detail?.orderCode ?? null,
      fecha: bogotaDay(ledger.firstPaymentAt ?? ledger.input.saleCreatedAt),
      entregada: ledger.input.deliveredAt !== null,
      cliente: ledger.input.clientName,
      productos: detail?.products ?? [],
      total: roundMoney(ledger.input.total),
      ...describeOrigin(ledger.input.saleId),
      ...describeLedgerDates(ledger),
    };
  });

  const ventas = [...paidSales, ...pendingSales].sort(
    (left, right) => left.fecha.localeCompare(right.fecha) || left.venta.localeCompare(right.venta),
  );

  const total = rows.reduce((sum, row) => sum + row.saleAmount, 0);
  const profit = rows.reduce((sum, row) => sum + row.netProfit, 0);

  return {
    periodo: range,
    estado_pago: estadoPago,
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
      ...(estadoPago === "pagadas"
        ? {}
        : {
            pendientes: {
              ventas: pendingLedgers.length,
              total: roundMoney(pendingLedgers.reduce((sum, ledger) => sum + ledger.input.total, 0)),
              pagado: roundMoney(pendingLedgers.reduce((sum, ledger) => sum + ledger.paid, 0)),
              saldo_pendiente: roundMoney(pendingLedgers.reduce((sum, ledger) => sum + ledger.balance, 0)),
            },
          }),
    },
    notas: [
      SELLER_NOTE,
      "'origen' sale de la linea de WhatsApp del chat en el CRM (Ventas 1 = Meta Ads, Ventas 2 = Marketplace, Admin = Referido, o Recurrente si ya habia comprado); venta directa = Mostrador. 'Sin dato' = la venta no tiene origen registrado (casi todas las anteriores a oct-2026). 'origen_detalle' trae el anuncio o la cuenta MK cuando el CRM los conoce.",
      "Pagadas: 'fecha' = cuando la venta empezo a contar (pago completo; contraentrega: entrega) y traen ganancia real. 'entregada' = false si solo falta entregarla.",
      "Pendientes (estado_pago 'pendientes' o 'todas'): ventas con abono que todavia no cuentan en Balances (falta plata, o contraentrega sin entregar). Su 'fecha' = fecha del primer abono y no traen ganancia. 'totales' de arriba son solo de las pagadas; las pendientes van en totales.pendientes.",
      PAYMENT_DATES_NOTE,
      "No incluye ventas canceladas.",
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
  const saleCodes = rows.map((quote) => quote.saleCode).filter((code): code is string => Boolean(code));
  const ledgers = saleCodes.length > 0 ? await loadLedgers(deps, { saleCodes }) : [];
  const ledgerByCode = new Map(ledgers.map((ledger) => [ledger.input.saleCode, ledger]));

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
      ...describeQuotePayments(quote.saleCode ? ledgerByCode.get(quote.saleCode) : undefined),
    })),
    notas: [
      "Se filtran por fecha de creacion de la cotizacion.",
      "Aprobada = la cotizacion se convirtio en venta (el sistema la marca 'Aceptada').",
      "pct_cierre = aprobadas / hechas dentro del filtro aplicado.",
      "Si pasó a venta: fecha_primer_abono, fecha_pago_completo, pagado y saldo_pendiente (de HOY). Sirve para ver, por ejemplo, cotizaciones de un mes que se pagaron en otro.",
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

  const fixedRates = await fixedRatesFor(deps, mes, anio);
  const report = computeCommissions(
    rows.map((row) => ({
      saleCode: row.saleCode,
      recognizedAt: row.createdAt,
      seller: detailById.get(row.saleId)?.seller ?? null,
      profit: row.netProfit,
    })),
    fixedRates,
  );

  return {
    mes,
    anio,
    periodo: describeRange(period),
    moneda: CURRENCY,
    criterio: SALES_CRITERIA,
    regla: `${COMMISSION_NEXT_SALES_RATE * 100}% de la ganancia de cada venta (pago completo; contraentrega: entrega). Hasta septiembre de 2026 la primera venta del mes de cada vendedora pagaba 10%. Si una vendedora tiene comision fija pactada ('comision_fija_pct'), esa tasa aplica a todas sus ventas del mes.`,
    ...report,
    notas: [
      SELLER_NOTE,
      "Una venta con ganancia cero o negativa cuenta como venta del mes pero no genera comision.",
    ],
  };
}

// Pantalla /admin/comisiones: mismas ventas y misma regla que comisiones_del_mes,
// con cliente, valor de la venta y "Falta entregar".
export async function getCommissionsBoardUseCase(deps: AsesorDependencies, mes: number, anio: number) {
  const period = buildMonthRange(mes, anio);
  const rows = await listRecognizedSales(deps.balances, period);
  const details = await deps.asesor.getSaleDetails(rows.map((row) => row.saleId));
  const detailById = new Map(details.map((detail) => [detail.saleId, detail]));

  const fixedRates = await fixedRatesFor(deps, mes, anio);
  const board = buildCommissionsBoard(
    rows.map((row) => {
      const detail = detailById.get(row.saleId);
      return {
        saleCode: row.saleCode,
        recognizedAt: row.createdAt,
        seller: detail?.seller ?? null,
        profit: row.netProfit,
        clientName: row.clientName ?? detail?.clientName ?? null,
        saleAmount: row.saleAmount,
        pendingDelivery: row.pendingDelivery,
      };
    }),
    fixedRates,
  );

  return {
    mes,
    anio,
    periodo: describeRange(period),
    rates: { first: COMMISSION_FIRST_SALE_RATE * 100, next: COMMISSION_NEXT_SALES_RATE * 100 },
    ...board,
  };
}

function describeQuotePayments(ledger: SaleLedger | undefined) {
  if (!ledger) return {};
  return {
    fecha_primer_abono: ledger.firstPaymentAt ? bogotaDay(ledger.firstPaymentAt) : null,
    fecha_pago_completo: ledger.fullyPaidAt ? bogotaDay(ledger.fullyPaidAt) : null,
    pagado: ledger.paid,
    saldo_pendiente: ledger.balance,
    venta_cancelada: ledger.cancelled,
  };
}

export type PaymentFilters = {
  vendedora?: string;
  cliente?: string;
  venta?: string;
};

export async function listPaymentsUseCase(deps: AsesorDependencies, desde: string, hasta: string, filters: PaymentFilters) {
  const range = describeRange(buildDayRange(desde, hasta));
  const ledgers = await loadLedgers(deps, filters.venta ? { saleCodes: [normalizeSaleCode(filters.venta)] } : undefined);

  const abonos = ledgers
    .filter(
      (ledger) => matchesText(ledger.input.sellerName, filters.vendedora) && matchesText(ledger.input.clientName, filters.cliente),
    )
    .flatMap((ledger) =>
      ledger.payments
        .filter((payment) => {
          const day = bogotaDay(payment.date);
          return day >= range.desde && day <= range.hasta;
        })
        .map((payment) => ({
          venta: ledger.input.saleCode,
          cotizacion: ledger.input.quoteCode,
          fecha_cotizacion: ledger.input.quoteCreatedAt ? bogotaDay(ledger.input.quoteCreatedAt) : null,
          cliente: ledger.input.clientName,
          vendedora: ledger.input.sellerName ?? UNASSIGNED_SELLER,
          ...describePayment(payment),
          total_venta: roundMoney(ledger.input.total),
          pagado_total: ledger.paid,
          saldo_pendiente: ledger.balance,
          venta_cancelada: ledger.cancelled,
        })),
    )
    .sort((left, right) => left.fecha_abono.localeCompare(right.fecha_abono) || left.venta.localeCompare(right.venta));

  const bySeller = new Map<string, { abonos: number; valor: number }>();
  for (const abono of abonos) {
    const current = bySeller.get(abono.vendedora) ?? { abonos: 0, valor: 0 };
    current.abonos += 1;
    current.valor += abono.valor;
    bySeller.set(abono.vendedora, current);
  }

  return {
    periodo: range,
    filtros: filters,
    moneda: CURRENCY,
    abonos,
    totales: {
      abonos: abonos.length,
      valor: roundMoney(abonos.reduce((sum, abono) => sum + abono.valor, 0)),
      primeros_abonos: abonos.filter((abono) => abono.es_primer_abono).length,
      retroactivos: abonos.filter((abono) => abono.retroactivo).length,
      por_vendedora: [...bySeller.entries()].map(([vendedora, data]) => ({
        vendedora,
        abonos: data.abonos,
        valor: roundMoney(data.valor),
      })),
    },
    notas: [
      "Se filtran por fecha del abono (la que escribio la persona; si no la escribio, el dia en que se registro), en dia de Colombia.",
      "retroactivo = la fecha del abono es de un dia anterior al dia en que se registro en el sistema. antes_de_la_cotizacion = la fecha del abono es anterior a la cotizacion (casi siempre un error de digitacion).",
      "sin_detalle = pagado guardado en una venta antigua sin abono detallado; se toma en la fecha de creacion de la venta.",
      "pagado_total y saldo_pendiente son de HOY. " + SELLER_NOTE,
    ],
  };
}

export async function getSaleUseCase(deps: AsesorDependencies, codigo: string) {
  const code = normalizeSaleCode(codigo);
  const [ledger] = await loadLedgers(deps, { saleCodes: [code] });
  if (!ledger) {
    throw new AsesorInputError(`No existe la venta ${code}. Usa el codigo SAL-..., por ejemplo SAL-00069.`);
  }

  const [details, profit] = await Promise.all([
    deps.asesor.getSaleDetails([ledger.input.saleId]),
    deps.balances.calculateSaleProfit(ledger.input.saleId),
  ]);
  const detail = details[0];

  return {
    venta: ledger.input.saleCode,
    cotizacion: ledger.input.quoteCode,
    orden: detail?.orderCode ?? null,
    cliente: ledger.input.clientName,
    vendedora: ledger.input.sellerName ?? UNASSIGNED_SELLER,
    registrada_por: detail?.registeredBy?.name ?? null,
    origen: saleOriginLabel(detail?.origin ?? null),
    origen_detalle: originDetailSummary(detail?.originDetail ?? null),
    origen_producto: detail?.productSource ?? null,
    productos: detail?.products ?? [],
    moneda: CURRENCY,
    total: roundMoney(ledger.input.total),
    ...describeLedgerDates(ledger),
    entregada: ledger.input.deliveredAt !== null,
    abonos: ledger.payments.map(describePayment),
    ganancia: profit
      ? {
          costo_producto: roundMoney(profit.supplierCosts),
          flete: roundMoney(profit.shippingCosts),
          ganancia: roundMoney(profit.netProfit),
          margen_pct: roundMoney(profit.marginPercentage),
        }
      : null,
    notas: [
      "cuenta_en_balances = true cuando la venta ya esta pagada completa (contraentrega: entregada); ahi cuenta para ventas del mes y comisiones.",
      "La ganancia puede cambiar mientras falten costos por confirmar (flete, costo de la proveedora).",
      PAYMENT_DATES_NOTE,
    ],
  };
}

export type SupplierDebtFilters = {
  proveedora?: string;
  desde?: string;
  hasta?: string;
};

// Cuanto se le debe a cada proveedora, orden por orden (SOLO LECTURA). El total es el mismo
// saldo de la lista /admin/proveedores (cargos - abonos) y nunca se filtra por fechas.
export async function getSupplierDebtsUseCase(deps: AsesorDependencies, filters: SupplierDebtFilters) {
  if (Boolean(filters.desde) !== Boolean(filters.hasta)) {
    throw new AsesorInputError('Para filtrar por fechas manda "desde" y "hasta" (AAAA-MM-DD), o ninguna de las dos.');
  }
  const range = filters.desde && filters.hasta ? describeRange(buildDayRange(filters.desde, filters.hasta)) : null;
  const inRange = (date: Date) => !range || (bogotaDay(date) >= range.desde && bogotaDay(date) <= range.hasta);

  const ledgers = await deps.asesor.listSupplierLedgers();
  const matching = ledgers.filter((ledger) => matchesText(ledger.name, filters.proveedora));
  if (filters.proveedora?.trim() && matching.length === 0) {
    throw new AsesorInputError(
      `No hay una proveedora con movimientos que se llame "${filters.proveedora}". Con movimientos: ${ledgers.map((l) => l.name).join(", ") || "ninguna"}.`,
    );
  }

  const describeAbono = (entry: { date: Date; accountName: string | null; amount: number; note: string | null }) => ({
    fecha: bogotaDay(entry.date),
    cuenta: entry.accountName ?? "Sin cuenta",
    monto: roundMoney(entry.amount),
    nota: entry.note,
  });

  const proveedoras = matching.flatMap((ledger) => {
    const debt = summarizeSupplierDebt(ledger.entries);
    const infoById = new Map(ledger.orders.map((order) => [order.orderId, order]));
    const ordenes = debt.orders.flatMap((order) => {
      const info = infoById.get(order.orderId);
      if (!info || !inRange(info.date)) return [];
      return [
        {
          of: info.manufacturingCode,
          orden: info.orderCode,
          fecha_of: bogotaDay(info.date),
          venta: info.saleCode,
          cliente: info.clientName,
          productos: info.products,
          costo_acordado: roundMoney(order.charged),
          pagado: roundMoney(order.paid),
          pagos: order.payments.map(describeAbono),
          falta: roundMoney(order.pending),
        },
      ];
    });
    const hasOthers = Math.abs(debt.others.charged) > 0.0001 || Math.abs(debt.others.paid) > 0.0001;
    // Sin filtro de nombre se omiten las que no tienen saldo ni ordenes en el rango.
    if (!filters.proveedora?.trim() && Math.abs(debt.balance) < 0.0001 && ordenes.length === 0) return [];
    return [
      {
        proveedora: ledger.name,
        debemos_total: roundMoney(debt.balance),
        falta_ordenes_listadas: roundMoney(ordenes.reduce((sum, orden) => sum + orden.falta, 0)),
        ordenes_con_saldo: ordenes.filter((orden) => orden.falta > 0.0001).length,
        ordenes,
        otros: hasOthers
          ? {
              cargado: roundMoney(debt.others.charged),
              pagado: roundMoney(debt.others.paid),
              falta: roundMoney(debt.others.pending),
              pagos: debt.others.payments.map(describeAbono),
            }
          : null,
      },
    ];
  });

  // Siempre de TODAS las proveedoras: es el mismo aviso de Balances ("pagos a proveedores sin cuenta").
  const sinCuenta = ledgers.flatMap((ledger) => {
    const infoById = new Map(ledger.orders.map((order) => [order.orderId, order]));
    return ledger.entries
      .filter((entry) => entry.type === "PAYMENT" && entry.accountName === null)
      .map((entry) => {
        const info = entry.orderId ? infoById.get(entry.orderId) : undefined;
        return {
          proveedora: ledger.name,
          fecha: bogotaDay(entry.date),
          monto: roundMoney(entry.amount),
          of: info?.manufacturingCode ?? null,
          orden: info?.orderCode ?? null,
          venta: info?.saleCode ?? null,
          nota: entry.note,
        };
      });
  });

  return {
    filtros: { proveedora: filters.proveedora ?? null, ...(range ?? {}) },
    moneda: CURRENCY,
    proveedoras,
    debemos_total: roundMoney(proveedoras.reduce((sum, row) => sum + row.debemos_total, 0)),
    pagos_sin_cuenta: {
      cantidad: sinCuenta.length,
      total: Math.round(sinCuenta.reduce((sum, row) => sum + row.monto, 0)),
      pagos: sinCuenta,
    },
    notas: [
      "debemos_total = todo lo cargado menos todo lo abonado a esa proveedora, sin importar las fechas: es el saldo de su tarjeta en /admin/proveedores. Positivo = le debemos; negativo = le pagamos de mas.",
      "costo_acordado = lo cargado a la proveedora en esa orden (se carga al confirmar el costo de compra). falta = costo_acordado - pagado.",
      "desde/hasta filtran las ordenes por la fecha de su orden de fabricacion (OF), o de la orden si no tiene OF (of = null). falta_ordenes_listadas es solo de esas ordenes.",
      "otros = cargos de inventario o manuales y abonos que no van a ninguna orden; entran en debemos_total.",
      "La pagina de detalle por mes de la proveedora cuenta distinto (marca cada producto pagado o no) y su saldo del mes puede no coincidir.",
      "pagos_sin_cuenta = abonos a proveedoras sin cuenta, de todas las proveedoras (no se filtra). Restan de lo que se debe pero no salen de ningun saldo de cuenta.",
    ],
  };
}
