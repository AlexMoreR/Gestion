import { z } from "zod";
import { adminModuleDefinitions } from "@/lib/admin-module-access";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
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
  listProductsUseCase,
  listQuotesUseCase,
  listSalesUseCase,
} from "../../application/use-cases";
import { AsesorInputError, currentMonthInBogota } from "../../domain/calculations";
import { createPrismaAsesorRepository } from "../../infrastructure/prisma-asesor-repository";
import { getMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { getCashPositionUseCase, getPayrollBoardUseCase } from "@/modules/nomina/application/use-cases";
import { PAY_PERIOD_LABELS } from "@/modules/nomina/domain/payroll";
import { createPrismaNominaRepository } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import type { McpServerDefinition, McpToolDefinition, McpToolResult } from "./protocol";

// Todas las herramientas son de SOLO LECTURA: solo llaman casos de uso de consulta.
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function getDependencies(): AsesorDependencies {
  return {
    balances: createPrismaBalancesRepository(),
    asesor: createPrismaAsesorRepository(),
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
}): McpToolDefinition {
  return {
    name: config.name,
    title: config.title,
    description: config.description,
    inputSchema: toInputSchema(config.schema),
    annotations: READ_ONLY_ANNOTATIONS,
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

export const asesorTools: McpToolDefinition[] = [
  defineTool({
    name: "resumen_del_mes",
    title: "Resumen del mes",
    description:
      "Resumen financiero de un mes: pedidos, ingresos, costo de producto, fletes, contribucion (ventas - producto - flete) y su %, y ticket promedio. Cuenta las ventas pagadas por completo en ese mes, aunque falte entregarlas (contraentrega: solo entregadas, en el mes de entrega). Mismo criterio que Balances. Valores en COP.",
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
      "Ventas pagadas por completo en un rango de fechas (por la fecha en que quedaron pagadas; contraentrega: entregadas, por fecha de entrega): fecha, si ya se entrego, cliente, productos, total, costo, flete, ganancia real, vendedora y origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador o Sin dato, con el anuncio o la cuenta MK si se conocen). Incluye totales al final. Valores en COP.",
    schema: z.object(rangeArgs),
    handler: (args, deps) => listSalesUseCase(deps, args.desde, args.hasta),
  }),
  defineTool({
    name: "listar_cotizaciones",
    title: "Listar cotizaciones",
    description:
      "Cotizaciones creadas en un rango de fechas: cuantas se hicieron, cuantas se aprobaron (convertidas en venta) y el % de cierre, con el detalle de cada una. Se puede filtrar por estado.",
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
      "Comisiones por vendedora en un mes: ganancia de sus ventas y comision (10% de la ganancia en su primera venta del mes, 15% de la segunda en adelante). Las ventas sin vendedora identificable salen como 'sin asignar'. Valores en COP.",
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
      "Cuanto dinero hay HOY en cada cuenta del negocio (efectivo, bancos, billeteras) y el total disponible. Saldo = saldo inicial + pagos de clientes - pagos a proveedoras - fletes - gastos (incluida nomina) +/- movimientos manuales. Avisa cuantos pagos o fletes quedaron registrados SIN cuenta (no suman ni restan en ningun saldo, por eso el saldo puede no cuadrar con el banco). Valores en COP.",
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
    name: "nomina_del_mes",
    title: "Nómina del mes",
    description:
      "Nomina de un mes por persona: basico del mes (por quincena, por dia trabajado o sin basico; en USD se convierte con la TRM guardada), comision del mes (misma regla de comisiones_del_mes), total, lo ya pagado (gastos de Nomina de esa persona para ese mes) y lo que falta pagar. Valores en COP.",
    schema: monthArgs,
    handler: async (args, deps) => {
      const { mes, anio } = resolveMonth(args);
      const board = await getPayrollBoardUseCase({ ...deps, nomina: createPrismaNominaRepository() }, mes, anio);
      return {
        mes,
        anio,
        moneda: "COP",
        trm_usada: board.trm,
        personas: board.rows.map((row) => ({
          persona: row.name,
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
            fecha: payment.date.toISOString().slice(0, 10),
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
        ],
      };
    },
  }),
  defineTool({
    name: "que_es_esta_aplicacion",
    title: "Qué es esta aplicación",
    description:
      "Radiografía técnica y funcional de Gestión para entender el sistema sin explicaciones: qué hace y qué problema resuelve, stack y versiones, despliegue, módulos y casos de uso, modelo de datos (cada entidad y sus relaciones), pantallas y rutas, reglas de negocio (con el código que las implementa), lo que el sistema NO tiene y riesgos de operación. Se genera leyendo el esquema y el código; lo no derivable sale de docs/asesor/gestion.md. Usa 'seccion' para pedir solo una parte.",
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
  version: "1.0.0",
  instructions:
    "Servidor de SOLO LECTURA de Gestion (Magilus): ventas, cotizaciones, productos, margenes, comisiones, nomina y saldos de cuentas. Para entender el sistema completo usa primero que_es_esta_aplicacion. No modifica ningun dato. Moneda: pesos colombianos (COP). Fechas en formato AAAA-MM-DD. Las ventas cuentan cuando quedan pagadas por completo, aunque falte entregarlas, en el mes de ese pago; la contraentrega cuenta al entregarse (igual que la pantalla de Balances).",
  tools: asesorTools,
};
