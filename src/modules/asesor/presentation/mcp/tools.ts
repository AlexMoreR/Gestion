import { z } from "zod";
import { adminModuleDefinitions } from "@/lib/admin-module-access";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { accountNegativeBalanceNotice } from "@/modules/balances/application/use-cases";
import { APP_OVERVIEW_SECTIONS, describeApplicationUseCase } from "../../application/describe-application";
import {
  COMMISSION_FIRST_SALE_RATE,
  COMMISSION_NEXT_SALES_RATE,
  QUOTE_STATUS_LABELS,
} from "../../domain/calculations";
import { createFilesystemAppIntrospection } from "../../infrastructure/filesystem-app-introspection";
import {
  type AsesorDependencies,
  getMonthlyCommissionsUseCase,
  getMonthSummaryUseCase,
  getSaleUseCase,
  getSupplierDebtsUseCase,
  findOrdersUseCase,
  listOpenOrdersUseCase,
  listPaymentsUseCase,
  listProductsUseCase,
  listExpensesUseCase,
  listRetroactivosUseCase,
  getActivityHistoryUseCase,
  listQuotesUseCase,
  listSalesUseCase,
} from "../../application/use-cases";
import { AsesorInputError, currentMonthInBogota } from "../../domain/calculations";
import { createPrismaAsesorRepository } from "../../infrastructure/prisma-asesor-repository";
import { colombiaDayKey, todayInColombia } from "@/lib/colombia-time";
import { getMoneyWithoutAccount, listMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { buildAccountLedger, findAccountByName, summarizeUnaccounted } from "@/modules/balances/domain/account-ledger";
import { getAccountLedgerRows, listLedgerAccounts } from "@/modules/balances/infrastructure/prisma-account-ledger";
import { getCashPositionUseCase, getPayrollBoardUseCase } from "@/modules/nomina/application/use-cases";
import { PAY_PERIOD_LABELS } from "@/modules/nomina/domain/payroll";
import { createPrismaNominaRepository, loadFixedCommissionRates } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import {
  filterTeam,
  TEAM_EMPLOYMENT_LABELS,
  TEAM_PAY_LABELS,
  TEAM_STATUS_LABELS,
  teamStatus,
  toPublicMember,
} from "@/modules/equipo/domain/team-member";
import { loadTeamMembers } from "@/modules/equipo/infrastructure/prisma-team-repository";
import {
  confirmVoiceExpense,
  describeVoiceExpense,
  prepareVoiceExpense,
} from "@/modules/expenses/application/register-expense-by-voice";
import { EXPENSE_CATEGORY_WORDS, ExpenseDraftInputError, resolveCategoryName } from "@/modules/expenses/domain/expense-draft";
import { createVoiceExpenseDeps } from "@/modules/expenses/infrastructure/voice-expense-deps";
import {
  SupplierPaymentInputError,
  confirmSupplierPayment,
  describeSupplierPayment,
  prepareSupplierPayment,
} from "@/modules/proveedores/application/register-supplier-payment-by-voice";
import { createPrismaSupplierPaymentDeps } from "@/modules/proveedores/infrastructure/prisma-supplier-payment-repository";
import {
  CIERRE_TOPE_DIFERENCIA,
  MonthCloseInputError,
  confirmMonthClose,
  describeCloseResult,
  prepareMonthClose,
} from "@/modules/balances/application/close-month";
import { createPrismaMonthCloseDeps } from "@/modules/balances/infrastructure/prisma-month-close";
import { buildCoverageReport } from "@/modules/transporte/domain/coverage-report";
import { listCoverageRows } from "@/modules/transporte/infrastructure/transporte-repository";
import { revalidatePath } from "next/cache";
import { refrescarTienda } from "@/lib/storefront-cache";
import { logActivityAs } from "@/lib/activity-log";
import {
  getSystemWhatsAppPhoneDisplay,
  getSystemWhatsAppPhoneHref,
  setSystemWhatsAppPhone,
} from "@/lib/system-settings";
import { changeSiteWhatsApp, type SiteWhatsAppDeps } from "../../application/site-whatsapp";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import {
  type ChatQuoteDeps,
  type ChatQuoteError,
  confirmChatQuote,
  prepareChatQuote,
} from "@/modules/cotizaciones-crm/application/create-quote-by-chat";
import { createPrismaCrmQuoteRepository } from "@/modules/cotizaciones-crm/infrastructure/prisma-crm-quote-repository";
import type { McpServerDefinition, McpToolDefinition, McpToolResult } from "./protocol";

// Casi todas las herramientas son de SOLO LECTURA: solo llaman casos de uso de consulta.
// Solo escriben registrar_gasto, registrar_pago_proveedora, cerrar_mes, cambiar_whatsapp_de_la_pagina y
// crear_cotizacion: guardan despues de que el dueno diga "si" (en gastos la foto del soporte es opcional y no se revisa).
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function getDependencies(): AsesorDependencies {
  return {
    balances: createPrismaBalancesRepository(),
    asesor: createPrismaAsesorRepository(),
    loadFixedCommissionRates: loadFixedCommissionRates(),
  };
}

// JSON compacto: el asesor de IA no necesita sangrias y asi ahorra tokens.
function textResult(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function errorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  // "input": los campos con valor por defecto quedan opcionales para quien llama.
  const jsonSchema = { ...(z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>) };
  delete jsonSchema.$schema;
  return jsonSchema;
}

function defineTool<Schema extends z.ZodObject>(config: {
  name: string;
  title: string;
  description: string;
  schema: Schema;
  handler: (args: z.infer<Schema>, deps: AsesorDependencies) => Promise<unknown>;
  // true = la herramienta escribe datos (se anuncia sin readOnlyHint).
  writes?: boolean;
}): McpToolDefinition {
  return {
    name: config.name,
    title: config.title,
    description: config.description,
    inputSchema: toInputSchema(config.schema),
    annotations: config.writes ? WRITE_ANNOTATIONS : READ_ONLY_ANNOTATIONS,
    async run(rawArgs) {
      const parsed = config.schema.safeParse(rawArgs);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "argumentos"}: ${issue.message}`)
          .join("; ");
        return errorResult(`Argumentos invalidos. ${issues}`);
      }
      try {
        return textResult(await config.handler(parsed.data, getDependencies()));
      } catch (error) {
        if (error instanceof AsesorInputError) {
          return errorResult(error.message);
        }
        console.error(`[mcp] ${config.name} fallo:`, error);
        return errorResult("No se pudo completar la consulta. Intenta de nuevo en un momento.");
      }
    },
  };
}

const monthArgs = z.object({
  mes: z.number().int().min(1).max(12).optional().describe("Mes (1-12). Si se omite, el mes en curso."),
  anio: z.number().int().min(2000).max(2100).optional().describe("Año, ej. 2026. Si se omite, el año en curso."),
});

const rangeArgs = {
  desde: z.string().describe("Fecha inicial inclusiva, formato AAAA-MM-DD."),
  hasta: z.string().describe("Fecha final inclusiva, formato AAAA-MM-DD."),
};

function resolveMonth(args: z.infer<typeof monthArgs>): { mes: number; anio: number } {
  const current = currentMonthInBogota();
  return { mes: args.mes ?? current.mes, anio: args.anio ?? current.anio };
}

function loadPayrollBoard(deps: AsesorDependencies, mes: number, anio: number) {
  return getPayrollBoardUseCase(
    { ...deps, nomina: createPrismaNominaRepository(), loadTeam: () => loadTeamMembers() },
    mes,
    anio,
  );
}

// Une "cambiar el WhatsApp de la pagina" con los ajustes, la cache de Next y la bitacora.
// Los mismos enlaces y repositorio que POST /api/cotizaciones (el boton del CRM).
function createChatQuoteDeps(): ChatQuoteDeps {
  return {
    repository: createPrismaCrmQuoteRepository(prisma),
    shareUrl: (token) => getSiteUrl(`/cotizaciones/${token}`),
    pdfUrl: (token) => getSiteUrl(`/api/generate-quote-pdf?token=${encodeURIComponent(token)}`),
    newComboKey: () => randomUUID(),
  };
}

// Error del caso de uso en una frase: que falta y, si la asesora no aparece, con quien se puede.
function chatQuoteErrorMessage(error: ChatQuoteError): string {
  const missing = error.missing?.map((item) => item.mensaje).join("; ");
  const asesoras = error.asesoras?.length ? `Asesoras posibles: ${error.asesoras.join(", ")}.` : "";
  return [`${error.error}.`, missing ? `${missing}.` : "", asesoras, "No se creó nada."].filter(Boolean).join(" ");
}

function createSiteWhatsAppDeps(): SiteWhatsAppDeps {
  return {
    current: () => getSystemWhatsAppPhoneDisplay(),
    save: (phone) => setSystemWhatsAppPhone(phone),
    // Lo mismo que adminUpdateWhatsAppPhoneAction: el layout cubre la tienda y todas sus paginas.
    refresh: () => {
      refrescarTienda();
      revalidatePath("/admin/cotizaciones");
    },
    async log(summary) {
      // La conexion del MCP no sabe quien habla: queda a nombre del dueno, como los gastos.
      const actor = await createVoiceExpenseDeps().resolveActor();
      if (actor) {
        await logActivityAs(actor, { action: "UPDATE", entityType: "SETTING", entityId: "whatsAppPhone", summary, origin: "MCP" });
      }
    },
  };
}

const WHATSAPP_USO =
  "Es el numero al que llegan los clientes de magilus.com (todos los botones de WhatsApp de la tienda) y tambien el contacto que sale en el enlace de cotizacion, en /fabricacion y en las guias.";

export const asesorTools: McpToolDefinition[] = [
  defineTool({
    name: "resumen_del_mes",
    title: "Resumen del mes",
    description:
      "Resumen financiero de un mes: pedidos, ingresos, costo de producto, fletes, contribucion (ventas - producto - flete) y su %, y ticket promedio, y el bloque ganancia_real (contribucion - pagos de Nomina a empleados del mes - gastos sin nomina) con la linea 'Nómina pagada: X · Retiros del dueño: Y' (los retiros del dueno no se restan; igual que listar_gastos). Cuenta las ventas pagadas por completo en ese mes, aunque falte entregarlas (contraentrega: solo entregadas, en el mes de entrega). Mismo criterio que Balances. Valores en COP.",
    schema: monthArgs,
    handler: (args, deps) => {
      const { mes, anio } = resolveMonth(args);
      return getMonthSummaryUseCase(deps, mes, anio);
    },
  }),
  defineTool({
    name: "listar_ventas",
    title: "Listar ventas",
    description:
      "Ventas de un rango de fechas. Por defecto (estado_pago 'pagadas') las pagadas por completo, por la fecha en que quedaron pagadas (contraentrega: entregadas, por fecha de entrega), con ganancia real como Balances. Con 'pendientes' trae las ventas con abono que todavia no estan pagadas completas (o contraentrega sin entregar), por fecha del primer abono, con lo pagado y el saldo; 'todas' trae ambas. Cada venta trae cliente, productos, total, vendedora, origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador o Sin dato), origen_producto (tipo stock, fabricacion, mixto o sin_orden, segun lo marcado en la orden, y ordenes_fabricacion con codigo OF, proveedora y productos), forma de pago y fechas de cotizacion, creacion, primer abono, pago completo y entrega, pagado y saldo pendiente. Productos: los de la orden o, si no hay orden, los de la cotizacion (productos_fuente), cada uno con nombre, codigo, color, cantidad, precio_unitario, total_linea, costo_unitario y costo_origen ('confirmado' con la proveedora, 'inventario' = stock, 'estimado de catálogo' o 'sin dato'). Trae link_cotizacion, link_venta y link_proveedora (orden de fabricacion; una o una lista): abren sin contraseña, compartelos solo con quien corresponde (cliente o su proveedora). Sin orden: orden = null y aviso_orden 'Falta crear la orden'; aviso_proveedora si hay orden sin OF. Las pagadas traen ganancia_confiable: false si falta la orden o algun costo no esta confirmado (o de inventario); esa ganancia no es definitiva y no se debe dar como real. Valores en COP.",
    schema: z.object({
      ...rangeArgs,
      estado_pago: z
        .enum(["pagadas", "pendientes", "todas"])
        .default("pagadas")
        .describe("pagadas (cuentan en Balances), pendientes (con saldo o contraentrega sin entregar) o todas. Por defecto: pagadas."),
    }),
    handler: (args, deps) => listSalesUseCase(deps, args.desde, args.hasta, args.estado_pago),
  }),
  defineTool({
    name: "listar_abonos",
    title: "Listar abonos",
    description:
      "Todos los abonos (pagos de clientes) de un rango de fechas, de ventas pagadas o no, por la fecha del abono. Filtros opcionales por vendedora, cliente o venta. Por abono: venta, cotizacion y su fecha, cliente, vendedora, fecha del abono, dia en que se registro, valor, cuenta, si es retencion en la fuente (es_retencion, con certificado_retencion; no entra a ninguna cuenta pero cuenta como pagado), si es el primer abono de la venta, si fue retroactivo (fecha anterior al dia de registro) o anterior a la cotizacion, total de la venta, pagado y saldo pendiente. Trae totales por vendedora. Sirve para: que se pago en un mes, primeros abonos del mes, cuanto debe cada cliente, abonos con fechas sospechosas. Valores en COP.",
    schema: z.object({
      ...rangeArgs,
      vendedora: z.string().optional().describe("Parte del nombre de la vendedora (sin importar tildes)."),
      cliente: z.string().optional().describe("Parte del nombre del cliente (sin importar tildes)."),
      venta: z.string().optional().describe("Codigo de la venta, ej. SAL-81 o 81."),
    }),
    handler: (args, deps) =>
      listPaymentsUseCase(deps, args.desde, args.hasta, {
        vendedora: args.vendedora,
        cliente: args.cliente,
        venta: args.venta,
      }),
  }),
  defineTool({
    name: "ver_venta",
    title: "Ver una venta",
    description:
      "Detalle completo de una venta por su codigo: cotizacion, orden, cliente, vendedora, origen, origen_producto (si salio de stock o por fabricacion: tipo stock, fabricacion, mixto o sin_orden segun lo marcado en la orden, y ordenes_fabricacion con codigo OF, proveedora y productos), productos, forma de pago, cada abono con su fecha, cuenta, si es retencion en la fuente (con su certificado) y si fue retroactivo, fechas (cotizacion, creacion, primer abono, pago completo, entrega), total, pagado, saldo pendiente, si ya cuenta en Balances y su ganancia. Productos: los de la orden o, si no hay orden, los de la cotizacion (productos_fuente), cada uno con nombre, codigo, color, cantidad, precio_unitario, total_linea, costo_unitario y costo_origen ('confirmado' con la proveedora, 'inventario' = stock, 'estimado de catálogo' o 'sin dato'). Trae link_cotizacion, link_venta y link_proveedora (orden de fabricacion; una o una lista): abren sin contraseña, compartelos solo con quien corresponde (cliente o su proveedora). Sin orden: orden = null y aviso_orden 'Falta crear la orden'; aviso_proveedora si hay orden sin OF. Ganancia: ganancia_confiable = true solo con orden y todos los costos 'confirmado' o 'inventario'; entonces 'ganancia' es la real de Balances. Si es false, 'ganancia' trae confiable: false (no darla como real), aviso_ganancia ('Costo aún no confirmado: la ganancia real no se puede dar') y ganancia_estimada (costo_producto, flete, ganancia, margen_pct, estimada: true) con los costos de los productos. Valores en COP.",
    schema: z.object({
      venta: z.string().min(1).describe("Codigo de la venta, ej. SAL-81 o 81."),
    }),
    handler: (args, deps) => getSaleUseCase(deps, args.venta),
  }),
  defineTool({
    name: "listar_cotizaciones",
    title: "Listar cotizaciones",
    description:
      "Cotizaciones creadas en un rango de fechas: cuantas se hicieron, cuantas se aprobaron (convertidas en venta) y el % de cierre, con el detalle de cada una. Si paso a venta trae la fecha del primer abono, la de pago completo, lo pagado y el saldo pendiente (sirve para ver cotizaciones de un mes que se pagaron en otro). Cada una trae productos (nombre, codigo, color, cantidad; sin precios ni costos), link_cotizacion y, si paso a venta, link_venta: abren sin contraseña, compartelos solo con quien corresponde. Precios, costos, costo_origen, la orden y la ganancia (confiable o estimada) de una venta se ven con ver_venta. Se puede filtrar por estado.",
    schema: z.object({
      ...rangeArgs,
      estado: z
        .enum(["todas", "revision", "enviada", "aceptada", "rechazada", "expirada"])
        .default("todas")
        .describe("Estado de la cotizacion. Por defecto: todas."),
    }),
    handler: (args, deps) => listQuotesUseCase(deps, args.desde, args.hasta, args.estado),
  }),
  defineTool({
    name: "listar_productos",
    title: "Listar productos",
    description:
      "Catalogo con precio, costo, flete por unidad y margen real restando el flete (ganancia unitaria, % sobre precio y % sobre costo). Valores en COP.",
    schema: z.object({
      busqueda: z.string().optional().describe("Texto para filtrar por nombre, codigo o categoria."),
      incluir_ocultos: z
        .boolean()
        .default(true)
        .describe("Incluir productos ocultos de la tienda. Por defecto: si."),
    }),
    handler: (args, deps) => listProductsUseCase(deps, args.busqueda, args.incluir_ocultos),
  }),
  defineTool({
    name: "comisiones_del_mes",
    title: "Comisiones del mes",
    description:
      "Comisiones por vendedora en un mes: ganancia de sus ventas y comision (15% de la ganancia de cada venta desde oct-2026; hasta sep-2026 la primera venta del mes pagaba 10%; o la comision fija pactada con esa persona, en comision_fija_pct). Las ventas sin vendedora identificable salen como 'sin asignar'. Valores en COP.",
    schema: monthArgs,
    handler: (args, deps) => {
      const { mes, anio } = resolveMonth(args);
      return getMonthlyCommissionsUseCase(deps, mes, anio);
    },
  }),
  defineTool({
    name: "saldos_de_cuentas",
    title: "Saldos de cuentas (dinero hoy)",
    description:
      "Cuanto dinero hay HOY en cada cuenta del negocio (efectivo, bancos, billeteras) y el total disponible. Saldo = saldo inicial + pagos de clientes - pagos a proveedoras - fletes - gastos (incluida nomina) +/- movimientos manuales. Avisa cuantos pagos o fletes quedaron registrados SIN cuenta (no suman ni restan en ningun saldo, por eso el saldo puede no cuadrar con el banco). Las retenciones en la fuente no cuentan como 'sin cuenta': nunca entran a una cuenta. El detalle de cada cuenta, movimiento por movimiento, se ve con movimientos_de_cuenta; el detalle de lo que no tiene cuenta, registro por registro, se ve con registros_sin_cuenta. Valores en COP.",
    schema: z.object({}),
    handler: async (_args, deps) => {
      const position = await getCashPositionUseCase(deps.balances, getMoneyWithoutAccount);
      return {
        moneda: "COP",
        total_disponible: position.total,
        por_tipo: position.byType.map((group) => ({ tipo: group.label, saldo: group.balance })),
        cuentas: position.accounts.map((account) => ({
          cuenta: account.name,
          tipo: account.type,
          activa: account.isActive,
          saldo: account.balance,
        })),
        sin_cuenta_asignada: {
          registros: position.withoutAccount.count,
          pagos_de_clientes: position.withoutAccount.salePayments,
          pagos_a_proveedoras: position.withoutAccount.supplierPayments,
          fletes: position.withoutAccount.shippingCosts,
        },
        notas: [
          "Es el saldo de hoy segun lo registrado en la app; si hay registros sin cuenta, comparar con el extracto del banco.",
        ],
      };
    },
  }),
  defineTool({
    name: "movimientos_de_cuenta",
    title: "Movimientos de una cuenta",
    description:
      "SOLO LECTURA. Cada movimiento de una cuenta del negocio, del mas viejo al mas nuevo, con el saldo acumulado despues de cada uno: abono de cliente, pago a proveedora, flete, gasto, nomina y movimiento manual (traslado). Por linea: fecha (dia de Colombia), tipo, entrada, salida, saldo, referencia (SAL, ORD, OF o despacho), nota y quien lo registro. Suma lo mismo que saldos_de_cuentas; cuadra_con_saldos_de_cuentas dice si el saldo final (sin fechas) es igual al de esa herramienta. Con 'desde', saldo_inicial es lo acumulado antes de esa fecha. Maximo 500 lineas (las mas nuevas, cortado=true); los totales cuentan todo. Los registros SIN cuenta no salen aqui. Sirve para: ¿por que Nequi tiene ese saldo?, cuadrar con el extracto. Valores en COP.",
    schema: z.object({
      cuenta: z.string().min(1).max(80).describe("Nombre de la cuenta, sin importar tildes ni mayusculas (ej. nequi, 1-Bancolombia)."),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa AAAA-MM-DD").optional().describe("Fecha inicial inclusiva AAAA-MM-DD. Si se omite, desde el principio."),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa AAAA-MM-DD").optional().describe("Fecha final inclusiva AAAA-MM-DD. Si se omite, hasta hoy."),
    }),
    handler: async (args, deps) => {
      const accounts = await listLedgerAccounts();
      const account = findAccountByName(accounts, args.cuenta);
      if (!account) {
        throw new AsesorInputError(
          `No encontre una sola cuenta '${args.cuenta}'. Cuentas: ${accounts.map((item) => item.name).join(", ") || "ninguna"}.`,
        );
      }
      if (args.desde && args.hasta && args.desde > args.hasta) {
        throw new AsesorInputError("'desde' no puede ser despues de 'hasta'.");
      }
      const [rows, position] = await Promise.all([
        getAccountLedgerRows(account.id),
        getCashPositionUseCase(deps.balances, getMoneyWithoutAccount),
      ]);
      const ledger = buildAccountLedger(account.openingBalance, rows, { desde: args.desde, hasta: args.hasta });
      const saldoTotal = args.desde || args.hasta ? buildAccountLedger(account.openingBalance, rows).saldo_final : ledger.saldo_final;
      // Saldos de cuentas oculta las inactivas en cero: para ellas el saldo es 0.
      const saldoDeSaldos = position.accounts.find((item) => item.id === account.id)?.balance ?? 0;
      return {
        moneda: "COP",
        cuenta: account.name,
        tipo: account.type,
        activa: account.isActive,
        desde: args.desde ?? null,
        hasta: args.hasta ?? null,
        ...ledger,
        cuadra_con_saldos_de_cuentas: Math.round(saldoTotal) === saldoDeSaldos,
        saldo_en_saldos_de_cuentas: saldoDeSaldos,
      };
    },
  }),
  defineTool({
    name: "registros_sin_cuenta",
    title: "Registros sin cuenta",
    description:
      "SOLO LECTURA. Uno por uno, los registros de plata guardados SIN cuenta (los mismos que cuenta sin_cuenta_asignada de saldos_de_cuentas): abonos de clientes (sin retenciones en la fuente), pagos a proveedoras y fletes (sin los que ya quedaron unidos a un pago al transportador). Por registro: fecha (dia de Colombia), registrado_el (hora Colombia), tipo, la clienta, proveedora o transportadora, venta (SAL), orden (ORD), OF y despacho si existen, quien lo registro y el valor. Ordenados por fecha, con cantidad y monto por tipo. No cambia nada: la cuenta se pone desde la pantalla. Valores en COP.",
    schema: z.object({}),
    handler: async () => ({
      moneda: "COP",
      ...summarizeUnaccounted(await listMoneyWithoutAccount()),
      notas: [
        "Esta herramienta no cambia nada: la cuenta de cada registro se pone desde la pantalla de Gestión.",
      ],
    }),
  }),
  defineTool({
    name: "nomina_del_mes",
    title: "Nómina del mes",
    description:
      "Nomina de un mes por persona: basico del mes (por quincena, por dia trabajado o sin basico; en USD se convierte con la TRM guardada), comision del mes (misma regla de comisiones_del_mes), total, lo ya pagado (gastos de Nomina de esa persona para ese mes) y lo que falta pagar. Valores en COP.",
    schema: monthArgs,
    handler: async (args, deps) => {
      const { mes, anio } = resolveMonth(args);
      const board = await loadPayrollBoard(deps, mes, anio);
      return {
        mes,
        anio,
        moneda: "COP",
        trm_usada: board.trm,
        personas: board.rows.map((row) => ({
          persona: row.name,
          estado: row.teamStatus ? TEAM_STATUS_LABELS[row.teamStatus] : "Sin ficha en Equipo",
          fecha_salida: row.endDate,
          tiene_usuario: row.hasUser,
          configurada: row.configured,
          tipo_basico: row.period ? PAY_PERIOD_LABELS[row.period] : "Sin configurar",
          basico_unitario: row.period && row.period !== "SIN_BASE" ? { valor: row.baseAmount, moneda: row.currency } : null,
          dias_trabajados: row.daysWorked,
          basico_del_mes: row.baseCop,
          ventas: row.salesCount,
          comision: row.commission,
          total_del_mes: row.totalDue,
          pagado: row.paid,
          falta_pagar: row.pending,
          pagos: row.payments.map((payment) => ({
            fecha: colombiaDayKey(payment.date),
            valor: Math.round(payment.amount),
            cuenta: payment.accountName,
            detalle: payment.description,
          })),
          avisos: row.warnings,
        })),
        totales: {
          basicos: board.totals.base,
          comisiones: board.totals.commission,
          total: board.totals.due,
          pagado: board.totals.paid,
          falta_pagar: board.totals.pending,
          incompleto: board.totals.incomplete,
        },
        notas: [
          "basico_del_mes = null si falta la TRM (basico en dolares) o los dias trabajados (pago diario).",
          "Las comisiones del mes en curso siguen subiendo mientras haya ventas.",
          "Entran todos los que trabajaron algun dia del mes segun su ficha de Equipo, aunque no tengan salario configurado. Un retirado aparece hasta su mes de salida; despues, solo si todavia tiene comision o pagos de ese mes.",
          "Pago por dia: dias escritos a mano en Nomina.",
        ],
      };
    },
  }),
  defineTool({
    name: "equipo",
    title: "Equipo (trabajadores)",
    description:
      "Trabajadores de Magilus segun su ficha en Equipo: nombre, cargo, si es el dueno, tipo de vinculacion (freelance...), forma de pago (por quincena, por dia o solo comision), fecha de ingreso, fecha de salida y motivo, estado (activo o retirado) y si tiene usuario en Gestion. No entrega datos personales (cedula, nacimiento, celular, correo, direccion ni contacto de emergencia). Lo que se paga sale de nomina_del_mes.",
    schema: z.object({
      estado: z
        .enum(["activos", "retirados", "todos"])
        .default("todos")
        .describe("activos, retirados o todos. Por defecto: todos."),
    }),
    handler: async (args) => {
      const today = todayInColombia();
      const members = filterTeam(await loadTeamMembers(), { estado: args.estado, q: "", pago: "" }, today);
      return {
        hoy: today,
        total: members.length,
        trabajadores: members.map((member) => {
          const item = toPublicMember(member);
          return {
            nombre: item.fullName,
            cargo: item.isOwner ? "Dueño" : item.jobTitle,
            es_dueno: item.isOwner,
            estado: TEAM_STATUS_LABELS[teamStatus(item, today)],
            vinculacion: TEAM_EMPLOYMENT_LABELS[item.employmentType],
            forma_de_pago: item.payType ? TEAM_PAY_LABELS[item.payType] : null,
            fecha_ingreso: item.startDate,
            fecha_salida: item.endDate,
            motivo_salida: item.exitReason,
            tiene_usuario: item.userId !== null,
          };
        }),
        notas: [
          "Retirado = su fecha de salida (ultimo dia trabajado) ya paso. El historial de ventas y pagos se conserva.",
          "Fechas vacias = Alexander aun no las ha escrito en /admin/equipo.",
        ],
      };
    },
  }),
  defineTool({
    name: "listar_gastos",
    title: "Listar gastos",
    description:
      "Gastos operativos de un mes (por fecha de gasto), con total por categoria y la GANANCIA REAL del mes: ventas - producto - flete - pagos de Nomina a empleados del mes (por fecha del pago) - gastos sin nomina. Cada gasto trae fecha, categoria, cuenta, monto, nota, persona (nomina) y si tiene foto del soporte. Filtro opcional por categoria (ej. publicidad = Marketing, arriendo, servicios, herramientas, varios, nomina). Los pagos de Nomina al dueno salen aparte como retiros_del_dueno y no se restan; 'linea' resume 'Nómina pagada: $X · Retiros del dueño: $Y'. Sirve para confirmar que un gasto quedo guardado. Valores en COP.",
    schema: monthArgs.extend({
      categoria: z
        .string()
        .max(60)
        .optional()
        .describe("Parte del nombre de la categoria (publicidad = marketing; otros = varios). Si se omite, todas."),
    }),
    handler: (args, deps) => {
      const { mes, anio } = resolveMonth(args);
      const categoria = args.categoria?.trim()
        ? (resolveCategoryName(args.categoria) ?? args.categoria)
        : undefined;
      return listExpensesUseCase(deps, mes, anio, categoria);
    },
  }),
  defineTool({
    name: "listar_retroactivos",
    title: "Listar registros retroactivos",
    description:
      "SOLO LECTURA. Ventas, abonos y gastos registrados con una fecha anterior al dia en que se cargaron (lo mismo que /admin/retroactivos). Por mes del registro REAL (hora Colombia; por defecto el mes actual). Cada registro trae tipo, persona que lo hizo, cuando lo registro de verdad, la fecha que puso, dias de atraso, monto y motivo ('sin dato' si falta). Trae el resumen por persona del mes (cantidad y monto por tipo, de todas las personas). Filtros opcionales: persona (nombre) y tipo. Valores en COP.",
    schema: z.object({
      mes: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Usa AAAA-MM")
        .optional()
        .describe("Mes del registro real, AAAA-MM. Si se omite, el mes actual (hora Colombia)."),
      persona: z.string().max(80).optional().describe("Parte del nombre de quien registro (sin tildes da igual). Si se omite, todas."),
      tipo: z.enum(["venta", "abono", "gasto"]).optional().describe("venta, abono o gasto. Si se omite, todos."),
    }),
    handler: (args, deps) =>
      listRetroactivosUseCase(deps, {
        mes: args.mes,
        persona: args.persona,
        tipo: args.tipo ? (args.tipo.toUpperCase() as "VENTA" | "ABONO" | "GASTO") : null,
      }),
  }),
  defineTool({
    name: "historial_de_registro",
    title: "Historial de registro (bitácora)",
    description:
      "SOLO LECTURA. Quién creó, cambió o borró algo, de lo más viejo a lo más nuevo, en hora de Colombia. Por codigo (ORD, OF, COM, SAL, COT con o sin ceros, o el id de un pago o abono; una orden o compra trae también sus cambios de estado) o por fecha (todo lo del día). Cada línea: hora, persona, desde dónde (pantalla, Claude, CRM, script o migración; sin dato = pantalla), qué hizo, antes y después (solo lo que cambió) y la tarjeta y commit si los tiene. Sirve para: ¿quién tocó la SAL-123?, ¿qué se hizo el 30-oct? Valores en COP.",
    schema: z.object({
      codigo: z
        .string()
        .max(60)
        .regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guiones")
        .optional()
        .describe("Código (ej. COM-00010, SAL-123, ORD-92) o id de un pago o abono. Va sin 'fecha'."),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa AAAA-MM-DD")
        .optional()
        .describe("Día en hora de Colombia, AAAA-MM-DD. Va sin 'codigo'."),
    }),
    handler: (args, deps) => getActivityHistoryUseCase(deps, args),
  }),
  defineTool({
    name: "deuda_con_proveedoras",
    title: "Deuda con proveedoras",
    description:
      "Cuanto se le debe a cada proveedora (fabricas y transportadoras), orden por orden. SOLO LECTURA: no registra ni cambia pagos. Por orden: codigo OF, orden, venta (SAL), cliente, productos con color, costo acordado, pagado, cada pago (fecha, cuenta, monto) y lo que falta. Por proveedora: debemos_total (el mismo saldo de su tarjeta en /admin/proveedores, nunca filtrado por fechas) y 'otros' (inventario o abonos sin orden). Trae aviso de pagos a proveedoras sin cuenta. Sirve para: cuanto le debemos a Laura, de que ordenes, cuadre de fin de mes. Valores en COP.",
    schema: z.object({
      proveedora: z.string().max(80).optional().describe("Parte del nombre de la proveedora (sin importar tildes), ej. laura. Si se omite, todas."),
      desde: z.string().optional().describe("Fecha inicial inclusiva AAAA-MM-DD (fecha de la OF). Va con 'hasta'."),
      hasta: z.string().optional().describe("Fecha final inclusiva AAAA-MM-DD (fecha de la OF). Va con 'desde'."),
    }),
    handler: (args, deps) => getSupplierDebtsUseCase(deps, args),
  }),
  defineTool({
    name: "buscar_pedido",
    title: "Buscar un pedido",
    description:
      "Encuentra un pedido sin pedir el código: por nombre de la clienta, teléfono, ciudad, departamento, producto o código (SAL, ORD, OF o COT, con o sin ceros: 'SAL-00078', 'sal-78' u '78'). Si dicen 'el pedido de Adriana' manda texto='Adriana'; 'el de Bogotá' → texto='Bogotá' (solo las palabras que identifican, cada una debe aparecer). SOLO LECTURA. Por pedido: venta, orden, cotización, clienta, teléfono, ciudad y departamento ('sin dato' si no están guardados), productos con color, vendedora, total, pagado, saldo, forma de pago (contraentrega o no), proveedoras con su OF, estado en palabras con fecha (por fabricar, en fabricación, listo para despacho, despachado con transportador y guía, entregado) y despachos con dirección. Máximo 10, el más reciente primero; 'coincidencias' da el total. No trae canceladas. Valores en COP.",
    schema: z.object({
      texto: z.string().max(80).describe("Nombre de la clienta, teléfono, ciudad, departamento, producto o código."),
    }),
    handler: (args, deps) => findOrdersUseCase(deps, args.texto),
  }),
  defineTool({
    name: "pedidos_abiertos",
    title: "Pedidos abiertos",
    description:
      "Todos los pedidos que aún no se entregan (ni cancelados), el más reciente primero, con los mismos datos de buscar_pedido: clienta, ciudad, productos, vendedora, total, pagado, saldo, forma de pago, proveedora y OF, y estado en palabras con fecha. Úsala al empezar una conversación sobre pedidos para tenerlos a la mano. 'sin_ciudad' dice cuántos no tienen ciudad guardada. SOLO LECTURA. Valores en COP.",
    schema: z.object({}),
    handler: (_args, deps) => listOpenOrdersUseCase(deps),
  }),
  defineTool({
    name: "listar_cobertura",
    title: "Cobertura de envíos",
    description:
      "SOLO LECTURA. Cobertura de envíos del panel de Transporte (/admin/transporte): el tipo efectivo de envío (GRATIS, ADICIONAL, COTIZAR o NO_LLEGA) por departamento y municipio. Los corregimientos solo salen si su tipo es distinto al de su municipio; los demás solo cuentan en los totales por tipo. pendiente_revision = lugar nuevo que mandó el CRM y aún no se revisa. Filtros opcionales: departamento (con o sin tildes) y tipo. Sirve, por ejemplo, para las exclusiones de campañas (dónde no llegamos o se cotiza).",
    schema: z.object({
      departamento: z.string().max(80).optional().optional().describe("Nombre del departamento, con o sin tildes (ej. arauca). Si se omite, todos."),
      tipo: z
        .enum(["gratis", "adicional", "cotizar", "no_llega"])
        .optional()
        .describe("gratis, adicional, cotizar o no_llega. Si se omite, todos."),
    }),
    handler: async (args) =>
      buildCoverageReport(await listCoverageRows(), { departamento: args.departamento, tipo: args.tipo }),
  }),
  defineTool({
    name: "registrar_gasto",
    title: "Registrar un gasto",
    description:
      "Registra un gasto del negocio. SIEMPRE en dos pasos: (1) llama con confirmado=false (por defecto): NO guarda nada, valida y devuelve el resumen del gasto; repitele el resumen al dueno y pregunta '¿Lo guardo?'. (2) SOLO si el dueno dice 'si', llama UNA SOLA VEZ con los MISMOS datos y confirmado=true: el gasto queda guardado de una vez y la respuesta trae su numero (gasto_id). NO la repitas: si se llama dos veces quedan dos gastos iguales. La foto del soporte es OPCIONAL y NO se revisa: la respuesta trae un enlace secreto (24 horas, un solo uso) por si el dueno quiere subirla despues desde el celular; Claude no puede subir la foto, solo dar el enlace. Si no la sube, el gasto sigue guardado igual. Descuenta el saldo de la cuenta y aparece en Balances del mes; si la cuenta quedo en negativo, el campo 'aviso' lo dice (vacio si no): repiteselo al dueno, el gasto igual queda guardado; se puede verificar con listar_gastos. Un gasto repetido se borra desde la pantalla de Gastos. Tope: $20.000.000 por gasto. Nomina exige 'persona'. Si la fecha es anterior a hoy exige 'motivo_fecha_anterior'. Moneda: COP.",
    schema: z.object({
      monto: z.number().positive().describe("Monto del gasto en pesos colombianos, ej. 350000."),
      categoria: z
        .enum(EXPENSE_CATEGORY_WORDS)
        .describe("arriendo, publicidad (= Marketing), nomina, servicios, herramientas u otros (= Varios)."),
      cuenta: z
        .string()
        .min(1)
        .max(80)
        .describe("De donde salio la plata: efectivo, banco o billetera. Si hay dos cuentas del mismo tipo, el nombre exacto de la cuenta."),
      fecha: z.string().optional().describe("Fecha del gasto, AAAA-MM-DD. Si se omite, hoy (hora Colombia). No puede ser futura."),
      nota: z.string().max(500).optional().describe("Detalle del gasto (a quien se pago, por que)."),
      motivo_fecha_anterior: z
        .string()
        .max(500)
        .optional()
        .describe("Obligatorio si la fecha es anterior a hoy: por que se registra tarde."),
      persona: z.string().max(80).optional().describe("Obligatorio en nomina: nombre de la persona a la que se le paga."),
      confirmado: z
        .boolean()
        .default(false)
        .describe("false = solo mostrar el resumen. true = el dueno ya dijo 'si': guardar el gasto (una sola vez)."),
    }),
    writes: true,
    handler: async (args) => {
      const deps = createVoiceExpenseDeps();
      const input = {
        amount: args.monto,
        category: args.categoria,
        account: args.cuenta,
        date: args.fecha,
        note: args.nota,
        retroReason: args.motivo_fecha_anterior,
        person: args.persona,
      };
      try {
        if (!args.confirmado) {
          const prepared = await prepareVoiceExpense(deps, input);
          return {
            guardado: false,
            resumen: describeVoiceExpense(prepared),
            categoria: prepared.categoryName,
            cuenta: prepared.account.name,
            monto: prepared.amount,
            fecha: prepared.day,
            siguiente_paso:
              "Repite este resumen al dueno y pregunta '¿Lo guardo?'. Si dice si, llama UNA SOLA VEZ mas con los mismos datos y confirmado=true para guardarlo (la foto es opcional y no se revisa).",
          };
        }
        const confirmed = await confirmVoiceExpense(deps, input);
        // Ya guardado: si la cuenta quedó bajo cero se avisa ("" si no). No bloquea.
        const aviso = await accountNegativeBalanceNotice(createPrismaBalancesRepository(), confirmed.accountId);
        return {
          guardado: true,
          gasto_id: confirmed.expenseId,
          resumen: confirmed.summary,
          aviso,
          enlace_para_subir_la_foto: confirmed.uploadUrl,
          vence: confirmed.uploadUrl ? confirmed.expiresAt.toISOString() : null,
          siguiente_paso: confirmed.uploadUrl
            ? "El gasto YA quedo guardado (no lo vuelvas a registrar). Dile al dueno su numero (gasto_id). Si quiere, puede subir la foto del soporte desde el celular con el enlace (opcional, no se revisa, un solo uso, 24 horas). Puedes verificarlo con listar_gastos."
            : "El gasto YA quedo guardado (no lo vuelvas a registrar). Dile al dueno su numero (gasto_id). No se pudo crear el enlace de la foto; si la quiere, la agrega desde la pantalla de Gastos.",
        };
      } catch (error) {
        if (error instanceof ExpenseDraftInputError) {
          throw new AsesorInputError(error.message);
        }
        throw error;
      }
    },
  }),
  defineTool({
    name: "registrar_pago_proveedora",
    title: "Registrar un pago a la proveedora",
    description:
      "Registra un pago a la proveedora en su orden de fabricacion (OF, ej. OF-35): queda como abono en la cuenta de la proveedora y descuenta el saldo de la cuenta de dinero. SIEMPRE en dos pasos: (1) llama con confirmado=false (por defecto): NO guarda nada y devuelve el resumen (OF, proveedora, venta, costo, pagado, falta, cuenta, fecha y avisos); repitele el resumen al dueno y pregunta '¿Lo guardo?'. (2) SOLO si el dueno dice 'si', llama UNA SOLA VEZ con los MISMOS datos y confirmado=true. NO uses registrar_gasto para pagos a proveedoras: el pago ya es costo de la venta y como gasto se contaria dos veces. Regla del negocio: con venta 50%/50% a la proveedora se le paga de una vez; en contraentrega, cuando el producto le llega al cliente (la herramienta solo avisa, no bloquea). Si el pago es mayor que lo que falta exige 'motivo_sobrepago'; si la fecha es anterior a hoy exige 'motivo_fecha_anterior'. Un pago igual (misma OF, monto y dia) a los pocos minutos se rechaza. Al confirmar, la respuesta trae un enlace secreto (24 horas, un solo uso) para que el dueno suba la foto del comprobante desde el celular (opcional; Claude no puede subirla, solo dar el enlace). Tope: $20.000.000. Moneda: COP.",
    schema: z.object({
      of: z.string().min(1).max(20).describe("Codigo de la orden de fabricacion, ej. OF-35 u OF-00035."),
      monto: z.number().positive().describe("Monto pagado a la proveedora en pesos colombianos, ej. 300000."),
      cuenta: z
        .string()
        .min(1)
        .max(80)
        .describe("De donde salio la plata: efectivo, banco o billetera. Si hay dos cuentas del mismo tipo, el nombre exacto de la cuenta."),
      fecha: z.string().optional().describe("Fecha del pago, AAAA-MM-DD. Si se omite, hoy (hora Colombia). No puede ser futura."),
      nota: z.string().max(300).optional().describe("Detalle del pago (ej. transferencia, segundo 50%)."),
      motivo_fecha_anterior: z
        .string()
        .max(200)
        .optional()
        .describe("Obligatorio si la fecha es anterior a hoy: por que se registra tarde."),
      motivo_sobrepago: z
        .string()
        .max(200)
        .optional()
        .describe("Obligatorio si el pago es mayor que lo que falta en la OF: por que."),
      confirmado: z
        .boolean()
        .default(false)
        .describe("false = solo mostrar el resumen. true = el dueno ya dijo 'si': guardar el pago (una sola vez)."),
    }),
    writes: true,
    handler: async (args) => {
      const deps = createPrismaSupplierPaymentDeps();
      const input = {
        of: args.of,
        monto: args.monto,
        cuenta: args.cuenta,
        fecha: args.fecha,
        nota: args.nota,
        motivoFechaAnterior: args.motivo_fecha_anterior,
        motivoSobrepago: args.motivo_sobrepago,
      };
      try {
        if (!args.confirmado) {
          const prepared = await prepareSupplierPayment(deps, input);
          return {
            guardado: false,
            resumen: describeSupplierPayment(prepared),
            of: prepared.of.code,
            proveedora: prepared.of.supplier.name,
            venta: prepared.of.saleCode,
            costo: prepared.balance.costo,
            pagado: prepared.balance.pagado,
            falta: prepared.balance.falta,
            cuenta: prepared.account.name,
            monto: prepared.monto,
            fecha: prepared.day,
            avisos: prepared.avisos,
            siguiente_paso: prepared.duplicado
              ? "Parece un pago repetido: ya se registro uno igual hace pocos minutos. Confirmalo con el dueno; si se confirma se rechazara."
              : "Repite este resumen (y los avisos) al dueno y pregunta '¿Lo guardo?'. Si dice si, llama UNA SOLA VEZ mas con los mismos datos y confirmado=true.",
          };
        }
        const confirmed = await confirmSupplierPayment(deps, input);
        return {
          guardado: true,
          pago_id: confirmed.paymentId,
          resumen: confirmed.summary,
          pagado: confirmed.balance.pagado,
          falta: confirmed.balance.falta,
          enlace_para_subir_la_foto: confirmed.uploadUrl,
          vence: confirmed.expiresAt.toISOString(),
          siguiente_paso:
            "El pago YA quedo guardado (no lo vuelvas a registrar). Dile al dueno cuanto se ha pagado y cuanto falta. Si quiere, puede subir la foto del comprobante desde el celular con el enlace (opcional, no se revisa, un solo uso, 24 horas).",
        };
      } catch (error) {
        if (error instanceof SupplierPaymentInputError) {
          throw new AsesorInputError(error.message);
        }
        throw error;
      }
    },
  }),
  defineTool({
    name: "cerrar_mes",
    title: "Cerrar el mes (cuadre con el banco)",
    description:
      `Cierre de mes: el dueno dicta el saldo REAL de cada cuenta activa (el del banco o lo que hay en caja al final del ultimo dia del mes) y Gestion lo compara con su saldo. Si hay diferencia crea UN movimiento manual de ajuste por cuenta (entrada si faltaba plata en Gestion, salida si sobraba) con la nota 'Cierre de mes AAAA-MM: cuadre con el banco', fechado el ultimo dia del mes. SIEMPRE en dos pasos: (1) confirmado=false (por defecto): NO guarda nada y devuelve el resumen; repiteselo al dueno y pregunta '¿Lo ajusto?'. (2) SOLO si dice 'si', llama UNA SOLA VEZ con los mismos datos y confirmado=true; la respuesta trae 'resumen' en una linea ('Cuadró' o 'En X faltaban/sobraban N pesos, ya quedó ajustado'): diselo tal cual. Una cuenta que ya tiene el ajuste de ese mes no se vuelve a ajustar. Si una diferencia pasa de $${CIERRE_TOPE_DIFERENCIA.toLocaleString("es-CO")} exige acepto_diferencia_grande=true (casi siempre es un numero mal dictado: confirmalo antes). 'mes' por defecto: el mes en curso si hoy es su ultimo dia; si no, el mes anterior. No se cierra un mes que aun no termina. Nada se borra: un error se corrige con un movimiento contrario en Balances. Moneda: COP.`,
    schema: z.object({
      saldos: z
        .array(
          z.object({
            cuenta: z.string().min(1).max(80).describe("Nombre de la cuenta (o efectivo, banco, billetera si hay una sola de ese tipo)."),
            saldo: z.number().finite().describe("Saldo real de la cuenta al cierre, en pesos colombianos, ej. 3250000."),
          }),
        )
        .min(1)
        .max(30)
        .describe("Saldo real de cada cuenta que dicto el dueno."),
      mes: z.string().optional().describe("Mes a cerrar, AAAA-MM. Por defecto, el que acaba de terminar (o el actual si hoy es su ultimo dia)."),
      acepto_diferencia_grande: z
        .boolean()
        .default(false)
        .describe("true solo si el dueno confirmo una diferencia mayor al tope."),
      confirmado: z
        .boolean()
        .default(false)
        .describe("false = solo mostrar el resumen. true = el dueno ya dijo 'si': crear los ajustes (una sola vez)."),
    }),
    writes: true,
    handler: async (args) => {
      const deps = createPrismaMonthCloseDeps();
      const input = { mes: args.mes, saldos: args.saldos, aceptoDiferenciaGrande: args.acepto_diferencia_grande };
      try {
        const lineas = (lines: Awaited<ReturnType<typeof prepareMonthClose>>["lines"]) =>
          lines.map((line) => ({
            cuenta: line.cuenta,
            saldo_gestion: line.saldoGestion,
            saldo_real: line.saldoReal,
            diferencia: line.diferencia,
            accion: line.accion,
          }));
        if (!args.confirmado) {
          const plan = await prepareMonthClose(deps, input);
          return {
            guardado: false,
            mes: plan.month,
            resumen: describeCloseResult(plan, false),
            cuentas: lineas(plan.lines),
            faltan: plan.faltan,
            diferencias_grandes: plan.grandes.map((line) => line.cuenta),
            siguiente_paso:
              plan.grandes.length > 0 && !args.acepto_diferencia_grande
                ? "Hay diferencias muy grandes: confirma con el dueno que los saldos esten bien dictados. Si dice que si, llama con confirmado=true y acepto_diferencia_grande=true."
                : "Repite el resumen al dueno y pregunta '¿Lo ajusto?'. Si dice si, llama UNA SOLA VEZ mas con los mismos datos y confirmado=true.",
          };
        }
        const done = await confirmMonthClose(deps, input);
        return {
          guardado: true,
          mes: done.plan.month,
          resumen: done.resumen,
          cuentas: lineas(done.plan.lines),
          faltan: done.plan.faltan,
          siguiente_paso: "Ya quedo guardado (no lo repitas). Dile al dueno el resumen en una linea, tal cual.",
        };
      } catch (error) {
        if (error instanceof MonthCloseInputError) {
          throw new AsesorInputError(error.message);
        }
        throw error;
      }
    },
  }),
  defineTool({
    name: "ver_whatsapp_de_la_pagina",
    title: "Ver el WhatsApp de la página",
    description: `Numero de WhatsApp que usa hoy la pagina y su enlace wa.me. ${WHATSAPP_USO} Para cambiarlo: cambiar_whatsapp_de_la_pagina.`,
    schema: z.object({}),
    handler: async () => ({
      numero: await getSystemWhatsAppPhoneDisplay(),
      enlace: `https://wa.me/${await getSystemWhatsAppPhoneHref()}`,
      uso: WHATSAPP_USO,
    }),
  }),
  defineTool({
    name: "cambiar_whatsapp_de_la_pagina",
    title: "Cambiar el WhatsApp de la página",
    description: `Cambia el numero de WhatsApp de la pagina (el mismo ajuste de /admin/configuracion/negocio → Guardar WhatsApp). ${WHATSAPP_USO} Cambia a que linea llegan TODOS los clientes de la pagina: hazlo solo si el dueno lo pide. SIEMPRE en dos pasos: (1) llama con confirmado=false (por defecto): NO guarda nada, valida el numero y devuelve el de antes y el nuevo; repiteselo al dueno y pregunta '¿Lo cambio?'. (2) SOLO si el dueno dice 'si', llama UNA SOLA VEZ con el mismo numero y confirmado=true: queda guardado, la tienda se refresca y se anota en la bitacora. Un numero invalido se rechaza y no se guarda nada.`,
    schema: z.object({
      numero: z.string().max(40).describe("Numero nuevo con indicativo, ej. +57 316 983 1667. Solo digitos, espacios, +, ( ) y guiones; 7 a 15 digitos."),
      confirmado: z
        .boolean()
        .default(false)
        .describe("false = solo mostrar el antes y el nuevo. true = el dueno ya dijo 'si': guardar el numero."),
    }),
    writes: true,
    handler: async (args) => {
      const change = await changeSiteWhatsApp(createSiteWhatsAppDeps(), args.numero, args.confirmado);
      return {
        ...change,
        siguiente_paso: change.guardado
          ? "Ya quedo guardado (no lo repitas). Dile al dueno el numero de antes y el nuevo; puede verificarlo con ver_whatsapp_de_la_pagina."
          : "Repite al dueno el numero de antes y el nuevo y pregunta '¿Lo cambio?'. Si dice si, llama UNA SOLA VEZ mas con el mismo numero y confirmado=true.",
      };
    },
  }),
  defineTool({
    name: "crear_cotizacion",
    title: "Crear una cotización",
    description:
      "Crea una cotizacion en Gestion (Borrador, a nombre de la asesora) con sus productos, colores, adicionales y observaciones, y da el codigo COT, el link publico y el link del PDF. SIEMPRE en dos pasos: (1) llama con confirmado=false (por defecto): NO crea nada y devuelve el resumen (cliente nuevo o existente, productos con precio y color, adicionales, total, asesora y avisos); repitele el resumen al dueno y pregunta '¿La creo?'. (2) SOLO si el dueno dice 'si', llama UNA SOLA VEZ con los MISMOS datos y confirmado=true. La asesora es OBLIGATORIA (si no aparece, la respuesta trae los nombres del equipo para elegir). El precio dictado manda aunque sea menor que el de Gestion (el resumen lo avisa: repiteselo al dueno); sin precio se usa el de Gestion. La silla auxiliar u otros extras sin codigo van DENTRO del precio del producto y escritos en el color o detalle (ej. color 'palo rosa + silla auxiliar'). El envio va como adicional (descripcion 'Envio', valor). Si el cliente ya existe (mismo correo, documento o telefono) se actualizan sus datos con los dictados. La misma cotizacion confirmada dos veces en 10 minutos devuelve la misma COT. No toca ventas, abonos ni saldos. Moneda: COP.",
    schema: z.object({
      cliente: z
        .object({
          nombre: z.string().max(120).optional().describe("Nombre completo del cliente."),
          documento: z.string().max(40).optional().describe("Cedula o NIT."),
          telefono: z.string().max(40).optional().describe("Celular del cliente."),
          direccion: z.string().max(200).optional().describe("Direccion."),
          ciudad: z.string().max(80).optional().describe("Ciudad del cliente."),
          departamento: z.string().max(80).describe("Departamento."),
          correo: z.string().max(120).optional().describe("Correo (opcional)."),
          barrio: z.string().max(80).optional().describe("Barrio (opcional)."),
        })
        .describe("Datos del cliente: nombre, documento, telefono, direccion, ciudad y departamento son obligatorios (si falta alguno, la respuesta dice cual)."),
      ciudad_entrega: z.string().max(80).optional().describe("Ciudad de entrega. Si se omite, la del cliente."),
      productos: z
        .array(
          z.object({
            codigo: z.string().min(1).max(40).describe("Codigo del producto, ej. PSV016 (ver listar_productos)."),
            cantidad: z.number().int().positive().max(100).describe("Unidades."),
            color: z.string().max(200).optional().describe("Color o detalle; los extras sin codigo van escritos aqui."),
            precio: z.number().positive().optional().describe("Precio unitario dictado en COP. Si se omite, el de Gestion."),
          }),
        )
        .min(1)
        .max(30)
        .describe("Productos de la cotizacion."),
      adicionales: z
        .array(
          z.object({
            descripcion: z.string().min(1).max(200).describe("Ej. 'Envio' o 'Base cromada'."),
            valor: z.number().positive().describe("Valor en COP."),
            producto: z.string().max(40).optional().describe("Codigo del producto al que va. Si se omite, el primero."),
          }),
        )
        .max(20)
        .optional()
        .describe("Adicionales con valor (el envio va aqui)."),
      observaciones: z.string().max(1000).optional().describe("Observaciones de la cotizacion."),
      asesora: z.string().min(1).max(80).describe("Nombre de la asesora que vende (obligatorio)."),
      confirmado: z
        .boolean()
        .default(false)
        .describe("false = solo mostrar el resumen. true = el dueno ya dijo 'si': crear la cotizacion (una sola vez)."),
    }),
    writes: true,
    handler: async (args) => {
      const deps = createChatQuoteDeps();
      const input = {
        cliente: args.cliente,
        ciudadEntrega: args.ciudad_entrega,
        productos: args.productos,
        adicionales: args.adicionales?.map((a) => ({ descripcion: a.descripcion, valor: a.valor, productoCodigo: a.producto })),
        observaciones: args.observaciones,
        asesora: args.asesora,
      };
      if (!args.confirmado) {
        const summary = await prepareChatQuote(deps, input);
        if (!summary.ok) throw new AsesorInputError(chatQuoteErrorMessage(summary));
        return {
          guardado: false,
          ...summary,
          siguiente_paso:
            "Repite este resumen al dueno (con los avisos de precio, si hay) y pregunta '¿La creo?'. Si dice si, llama UNA SOLA VEZ mas con los mismos datos y confirmado=true.",
        };
      }
      const created = await confirmChatQuote(deps, input);
      if (!created.ok) throw new AsesorInputError(chatQuoteErrorMessage(created));
      return {
        guardado: true,
        codigo: created.code,
        total: created.total,
        link: created.shareUrl,
        pdf: created.pdfUrl,
        ya_existia: created.reused,
        siguiente_paso: created.reused
          ? "Esta cotizacion ya se habia creado hace unos minutos: es la misma (no se creo otra). Dale al dueno el codigo y los links."
          : "La cotizacion YA quedo creada (no la vuelvas a crear). Dale al dueno el codigo, el link y el PDF; se ve en /admin/cotizaciones.",
      };
    },
  }),
  defineTool({
    name: "que_es_esta_aplicacion",
    title: "Qué es esta aplicación",
    description:
      "Radiografía técnica y funcional de Gestión para entender el sistema sin explicaciones: qué hace y qué problema resuelve, stack y versiones, despliegue, módulos y casos de uso, modelo de datos (cada entidad y sus relaciones), pantallas y rutas, reglas de negocio (con el código que las implementa), lo que el sistema NO tiene y riesgos de operación. Se genera leyendo el esquema y el código; lo no derivable sale de docs/asesor/gestion.md. Usa 'seccion' para pedir solo una parte. seccion='pantallas' da el manual de pantallas (docs/asesor/pantallas.md): la ruta y el texto exacto del botón de cada opción del panel; úsala cuando pregunten '¿dónde está…?' o '¿dónde hago…?', en vez de pedir capturas.",
    schema: z.object({
      seccion: z
        .enum(APP_OVERVIEW_SECTIONS)
        .default("todo")
        .describe("Parte de la radiografía. Por defecto: todo."),
    }),
    handler: (args) =>
      describeApplicationUseCase(
        createFilesystemAppIntrospection(),
        {
          nodeVersion: process.version,
          adminModules: adminModuleDefinitions.map((module) => ({ ...module })),
          quoteStatusLabels: QUOTE_STATUS_LABELS,
          commissionRates: {
            primeraVentaDelMes: COMMISSION_FIRST_SALE_RATE,
            desdeLaSegunda: COMMISSION_NEXT_SALES_RATE,
          },
        },
        args.seccion,
      ),
  }),
];

export const asesorMcpServer: McpServerDefinition = {
  name: "gestion-magilus",
  version: "1.3.0",
  instructions:
    "Servidor de consulta de Gestion (Magilus) que ademas registra gastos, pagos a proveedoras, el cierre de mes y cotizaciones: ventas (pagadas y con saldo pendiente), abonos, cotizaciones, productos, margenes, comisiones, nomina, equipo (trabajadores activos y retirados), saldos de cuentas, gastos del mes con la ganancia real (listar_gastos) cuanto se le debe a cada proveedora orden por orden (deuda_con_proveedoras), pedidos por clienta o ciudad con su estado (buscar_pedido, pedidos_abiertos) y la cobertura de envios por departamento y municipio (listar_cobertura). Para entender el sistema completo usa primero que_es_esta_aplicacion. El WhatsApp de la pagina (al que llegan los clientes de magilus.com) se lee con ver_whatsapp_de_la_pagina. Todas las herramientas son de lectura salvo registrar_gasto, registrar_pago_proveedora, cerrar_mes (cierre de mes: el dueno dicta el saldo real de cada cuenta y se crea un ajuste por cuenta), cambiar_whatsapp_de_la_pagina (cambia a que linea llegan los clientes de la pagina; solo si el dueno lo pide) y crear_cotizacion (crea una cotizacion con productos, colores y adicionales; la asesora es obligatoria; no toca ventas ni saldos), las unicas que escriben: antes de guardar SIEMPRE repite el resumen al dueno y espera su 'si' (primero con confirmado=false, luego confirmado=true, UNA sola vez: dos llamadas de registrar_gasto crean dos gastos). Un pago a una proveedora por su orden de fabricacion (OF) va con registrar_pago_proveedora, nunca como gasto (contaria el costo dos veces). La foto del soporte es opcional y NO se revisa: se sube despues por un enlace opcional. Moneda: pesos colombianos (COP). Fechas en formato AAAA-MM-DD. Las ventas cuentan cuando quedan pagadas por completo, aunque falte entregarlas, en el mes de ese pago; la contraentrega cuenta al entregarse (igual que la pantalla de Balances).",
  tools: asesorTools,
};
