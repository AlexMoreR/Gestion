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
  getSaleUseCase,
  getSupplierDebtsUseCase,
  listPaymentsUseCase,
  listProductsUseCase,
  listExpensesUseCase,
  listQuotesUseCase,
  listSalesUseCase,
} from "../../application/use-cases";
import { AsesorInputError, buildDayRange, currentMonthInBogota } from "../../domain/calculations";
import { createPrismaAsesorRepository } from "../../infrastructure/prisma-asesor-repository";
import { getMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { getCashPositionUseCase, getPayrollBoardUseCase } from "@/modules/nomina/application/use-cases";
import { PAY_PERIOD_LABELS } from "@/modules/nomina/domain/payroll";
import { createPrismaNominaRepository, loadFixedCommissionRates } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import {
  filterTeam,
  normalizePersonName,
  TEAM_EMPLOYMENT_LABELS,
  TEAM_PAY_LABELS,
  TEAM_STATUS_LABELS,
  teamStatus,
  todayInBogota,
  toPublicMember,
} from "@/modules/equipo/domain/team-member";
import { loadTeamMembers } from "@/modules/equipo/infrastructure/prisma-team-repository";
import {
  ASISTENCIA_NOMINA_DESDE,
  ATTENDANCE_KIND_LABELS,
  ATTENDANCE_ORIGIN_LABELS,
  DAY_STATUS_LABELS,
  bogotaTime,
  formatMinutes,
} from "@/modules/asistencia/domain/attendance";
import {
  AttendanceInputError,
  getRangeBoardUseCase,
  getTodayBoardUseCase,
} from "@/modules/asistencia/application/use-cases";
import {
  createPrismaAsistenciaRepository,
  loadAttendanceDays,
} from "@/modules/asistencia/infrastructure/prisma-asistencia-repository";
import {
  confirmVoiceExpense,
  describeVoiceExpense,
  prepareVoiceExpense,
} from "@/modules/expenses/application/register-expense-by-voice";
import { EXPENSE_CATEGORY_WORDS, ExpenseDraftInputError, resolveCategoryName } from "@/modules/expenses/domain/expense-draft";
import { createVoiceExpenseDeps } from "@/modules/expenses/infrastructure/voice-expense-deps";
import { CierreInputError, cerrarMes, CIERRE_TOPE_AJUSTE, mesEnCursoBogota } from "@/modules/balances/application/close-month";
import { createMonthCloseDeps } from "@/modules/balances/infrastructure/month-close-deps";
import type { McpServerDefinition, McpToolDefinition, McpToolResult } from "./protocol";

// Casi todas las herramientas son de SOLO LECTURA: solo llaman casos de uso de consulta.
// Escriben solo registrar_gasto y cerrar_mes: guardan despues de que el dueno diga "si"
// (la foto del soporte es opcional y no se revisa).
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
    { ...deps, nomina: createPrismaNominaRepository(), loadTeam: () => loadTeamMembers(), loadAttendanceDays },
    mes,
    anio,
  );
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
      "Ventas de un rango de fechas. Por defecto (estado_pago 'pagadas') las pagadas por completo, por la fecha en que quedaron pagadas (contraentrega: entregadas, por fecha de entrega), con ganancia real como Balances. Con 'pendientes' trae las ventas con abono que todavia no estan pagadas completas (o contraentrega sin entregar), por fecha del primer abono, con lo pagado y el saldo; 'todas' trae ambas. Cada venta trae cliente, productos, total, vendedora, origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador o Sin dato), forma de pago y fechas de cotizacion, creacion, primer abono, pago completo y entrega, pagado y saldo pendiente. Valores en COP.",
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
      venta: z.string().optional().describe("Codigo de la venta, ej. SAL-00069 o 69."),
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
      "Detalle completo de una venta por su codigo: cotizacion, orden, cliente, vendedora, origen, productos, forma de pago, cada abono con su fecha, cuenta, si es retencion en la fuente (con su certificado) y si fue retroactivo, fechas (cotizacion, creacion, primer abono, pago completo, entrega), total, pagado, saldo pendiente, si ya cuenta en Balances y su ganancia. Valores en COP.",
    schema: z.object({
      venta: z.string().min(1).describe("Codigo de la venta, ej. SAL-00069 o 69."),
    }),
    handler: (args, deps) => getSaleUseCase(deps, args.venta),
  }),
  defineTool({
    name: "listar_cotizaciones",
    title: "Listar cotizaciones",
    description:
      "Cotizaciones creadas en un rango de fechas: cuantas se hicieron, cuantas se aprobaron (convertidas en venta) y el % de cierre, con el detalle de cada una. Si paso a venta trae la fecha del primer abono, la de pago completo, lo pagado y el saldo pendiente (sirve para ver cotizaciones de un mes que se pagaron en otro). Se puede filtrar por estado.",
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
      "Cuanto dinero hay HOY en cada cuenta del negocio (efectivo, bancos, billeteras) y el total disponible. Saldo = saldo inicial + pagos de clientes - pagos a proveedoras - fletes - gastos (incluida nomina) +/- movimientos manuales. Avisa cuantos pagos o fletes quedaron registrados SIN cuenta (no suman ni restan en ningun saldo, por eso el saldo puede no cuadrar con el banco). Las retenciones en la fuente no cuentan como 'sin cuenta': nunca entran a una cuenta. Valores en COP.",
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
          // "asistencia" (registro de entrada y salida, desde nov-2026) o "manual" (escritos en Nomina).
          dias_fuente: row.daysSource,
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
          "Entran todos los que trabajaron algun dia del mes segun su ficha de Equipo, aunque no tengan salario configurado. Un retirado aparece hasta su mes de salida; despues, solo si todavia tiene comision o pagos de ese mes.",
          `Pago por dia: desde ${ASISTENCIA_NOMINA_DESDE} los dias salen de la asistencia (un dia cuenta si tiene al menos una entrada; dias_fuente = "asistencia"). Antes, de los dias escritos a mano en Nomina (dias_fuente = "manual").`,
        ],
      };
    },
  }),
  defineTool({
    name: "asistencia",
    title: "Asistencia (entradas y salidas)",
    description:
      "Registro de entrada y salida del equipo: quien esta trabajando ahora, y por cada dia la hora de entrada, la de salida, las horas y si hubo correcciones (quien corrigio y el motivo). Recibe una fecha o un rango desde/hasta (por defecto hoy) y una persona opcional (nombre o parte del nombre). Da los dias trabajados del rango: un dia cuenta si tiene al menos una entrada. Horas en hora Colombia (HH:MM).",
    schema: z.object({
      fecha: z.string().optional().describe("Un solo dia, formato AAAA-MM-DD. Si no se da fecha ni rango: hoy."),
      desde: z.string().optional().describe("Fecha inicial inclusiva, AAAA-MM-DD (para un rango; maximo 62 dias)."),
      hasta: z.string().optional().describe("Fecha final inclusiva, AAAA-MM-DD. Si se omite, igual a desde."),
      persona: z.string().max(80).optional().describe("Nombre o parte del nombre de la persona. Si se omite, todas."),
    }),
    handler: async (args) => {
      const now = new Date();
      const today = todayInBogota(now);
      const desde = args.fecha ?? args.desde ?? args.hasta ?? today;
      const hasta = args.fecha ?? args.hasta ?? args.desde ?? today;
      // Valida formato y orden (lanza AsesorInputError con un mensaje claro).
      const range = buildDayRange(desde, hasta);
      if ((range.to.getTime() - range.from.getTime()) / 86_400_000 > 62) {
        throw new AsesorInputError("El rango no puede pasar de 62 dias.");
      }
      const repo = createPrismaAsistenciaRepository();
      let userId: string | undefined;
      const query = normalizePersonName(args.persona ?? "");
      if (args.persona?.trim() && !query) {
        throw new AsesorInputError("Escribe el nombre de la persona (letras).");
      }
      if (query) {
        const staff = await repo.listStaff();
        const matches = staff.filter((member) => normalizePersonName(member.name).includes(query));
        if (matches.length === 0) {
          throw new AsesorInputError(`No hay un trabajador con ese nombre. Trabajadores: ${staff.map((member) => member.name).join(", ")}.`);
        }
        if (matches.length > 1) {
          throw new AsesorInputError(`Hay varias personas con ese nombre: ${matches.map((member) => member.name).join(", ")}. Se mas especifico.`);
        }
        userId = matches[0].id;
      }
      let board;
      let todayBoard;
      try {
        [board, todayBoard] = await Promise.all([
          getRangeBoardUseCase(repo, { fromDay: desde, toDay: hasta, userId }, now),
          desde <= today && today <= hasta ? getTodayBoardUseCase(repo, now) : Promise.resolve(null),
        ]);
      } catch (error) {
        if (error instanceof AttendanceInputError) throw new AsesorInputError(error.message);
        throw error;
      }
      const time = (value: Date | null) => (value ? bogotaTime(value) : null);
      return {
        hoy: today,
        hora_actual: bogotaTime(now),
        desde,
        hasta: board.toDay,
        trabajando_ahora: todayBoard
          ? todayBoard.rows
              .filter((row) => (!userId || row.person.id === userId) && row.summary.status === "TRABAJANDO")
              .map((row) => ({ persona: row.person.name, desde: time(row.summary.firstEntry) }))
          : null,
        no_han_llegado_hoy: todayBoard
          ? todayBoard.rows
              .filter((row) => (!userId || row.person.id === userId) && row.summary.status === "NO_HA_LLEGADO")
              .map((row) => row.person.name)
          : null,
        personas: board.people.map((row) => ({
          persona: row.person.name,
          dias_trabajados: row.workedDays,
          horas: Math.round((row.minutes / 60) * 100) / 100,
          horas_texto: formatMinutes(row.minutes),
          dias_con_correccion: row.corrections,
          dias_sin_marcar_salida: row.missingExits,
          dias: row.days.map((day) => ({
            fecha: day.day,
            estado: day.day === today ? DAY_STATUS_LABELS[day.status] : day.worked ? "Trabajó" : "Sin entrada",
            entrada: time(day.firstEntry),
            salida: time(day.lastExit),
            horas: Math.round((day.minutes / 60) * 100) / 100,
            sin_salida: day.openEntry,
            corregido: day.corrected,
            motivos: day.reasons,
            marcas: day.marks.map((mark) => ({
              tipo: ATTENDANCE_KIND_LABELS[mark.kind],
              hora: bogotaTime(mark.markedAt),
              origen: ATTENDANCE_ORIGIN_LABELS[mark.origin],
              hecha_por: mark.origin === "PROPIA" ? null : mark.createdByName,
              motivo: mark.reason,
              anulada: mark.voidedAt !== null,
              anulada_por: mark.voidedByName,
              motivo_anulacion: mark.voidReason,
            })),
          })),
        })),
        notas: [
          "Un dia cuenta como trabajado si tiene al menos una entrada (no anulada). Una salida olvidada no inventa horas: esa entrada no suma horas.",
          "La hora de cada marca la pone el servidor; solo un admin puede corregir o agregar una marca, con motivo. Las marcas corregidas no se borran: quedan anuladas.",
          "El turno que pasa de medianoche cuenta en el dia de la entrada.",
          `La nomina por dia toma estos dias desde ${ASISTENCIA_NOMINA_DESDE} (ver nomina_del_mes, dias_fuente).`,
          "Solo marcan los usuarios Empleado o Admin; quien no tiene usuario en Gestion no aparece.",
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
      const today = todayInBogota();
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
      "Gastos operativos de un mes (por fecha de gasto), con total por categoria y la GANANCIA REAL del mes: ventas - producto - flete - comisiones - sueldos basicos - gastos. Cada gasto trae fecha, categoria, cuenta, monto, nota, persona (nomina) y si tiene foto del soporte. Filtro opcional por categoria (ej. publicidad = Marketing, arriendo, servicios, herramientas, varios, nomina). Los pagos de Nomina no se restan como gasto (la nomina ya entra como comisiones + basicos). Sirve para confirmar que un gasto quedo guardado. Valores en COP.",
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
      return listExpensesUseCase(deps, mes, anio, categoria, async () => {
        const board = await loadPayrollBoard(deps, mes, anio);
        return {
          base: board.totals.base,
          commission: board.totals.commission,
          incomplete: board.totals.incomplete,
        };
      });
    },
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
    name: "registrar_gasto",
    title: "Registrar un gasto",
    description:
      "Registra un gasto del negocio. SIEMPRE en dos pasos: (1) llama con confirmado=false (por defecto): NO guarda nada, valida y devuelve el resumen del gasto; repitele el resumen al dueno y pregunta '¿Lo guardo?'. (2) SOLO si el dueno dice 'si', llama UNA SOLA VEZ con los MISMOS datos y confirmado=true: el gasto queda guardado de una vez y la respuesta trae su numero (gasto_id). NO la repitas: si se llama dos veces quedan dos gastos iguales. La foto del soporte es OPCIONAL y NO se revisa: la respuesta trae un enlace secreto (24 horas, un solo uso) por si el dueno quiere subirla despues desde el celular; Claude no puede subir la foto, solo dar el enlace. Si no la sube, el gasto sigue guardado igual. Descuenta el saldo de la cuenta y aparece en Balances del mes; se puede verificar con listar_gastos. Un gasto repetido se borra desde la pantalla de Gastos. Tope: $20.000.000 por gasto. Nomina exige 'persona'. Si la fecha es anterior a hoy exige 'motivo_fecha_anterior'. Moneda: COP.",
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
        return {
          guardado: true,
          gasto_id: confirmed.expenseId,
          resumen: confirmed.summary,
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
    name: "cerrar_mes",
    title: "Cerrar el mes (cuadre con el banco)",
    description:
      "Cierre de mes: el dueno dicta el saldo REAL de cada cuenta activa al final del mes (lo que dice el banco, la caja o la billetera) y Gestion lo compara con su saldo de cierre de ese mes. Si hay diferencia crea UN movimiento manual de ajuste por cuenta (ingreso si en Gestion faltaba plata, salida si sobraba) con la nota 'Cierre de mes AAAA-MM: cuadre con el banco', fechado el ultimo dia del mes. Una cuenta que ya tiene el ajuste de ese mes no se vuelve a ajustar. SIEMPRE en dos pasos: (1) confirmado=false (por defecto): NO guarda, devuelve el resumen; repitelo al dueno y pregunta '¿Lo ajusto?'. (2) SOLO si dice 'si', llama con los MISMOS datos y confirmado=true. Si un ajuste pasa del tope ($" + CIERRE_TOPE_AJUSTE.toLocaleString("es-CO") + ") NO se guarda: dile al dueno el monto, preguntale si el saldo esta bien dictado y, solo si lo confirma, llama otra vez con acepto_ajuste_grande=true. Responde al dueno con la frase de 'resumen', en una linea. Nada se borra: un ajuste equivocado se corrige con un movimiento contrario en Balances. Moneda: COP.",
    schema: z.object({
      mes: z.string().optional().describe("Mes que se cierra, AAAA-MM. Si se omite, el mes en curso (hora Colombia)."),
      saldos: z
        .array(
          z.object({
            cuenta: z.string().min(1).max(80).describe("Nombre de la cuenta (o efectivo, banco, billetera si hay una sola de ese tipo)."),
            saldo: z.number().min(-1_000_000_000).max(1_000_000_000).describe("Saldo real de la cuenta en COP, ej. 2350000."),
          }),
        )
        .min(1)
        .max(30)
        .describe("Saldo real de cada cuenta que dicto el dueno."),
      confirmado: z.boolean().default(false).describe("false = solo mostrar el resumen. true = el dueno ya dijo 'si': guardar los ajustes."),
      acepto_ajuste_grande: z
        .boolean()
        .default(false)
        .describe("true solo si el dueno confirmo de nuevo un ajuste mayor al tope."),
    }),
    writes: true,
    handler: async (args) => {
      const actor = await createVoiceExpenseDeps().resolveActor();
      if (!actor) {
        throw new AsesorInputError("No hay un usuario administrador a cuyo nombre dejar el ajuste.");
      }
      try {
        const mes = args.mes?.trim() || mesEnCursoBogota();
        const result = await cerrarMes(createMonthCloseDeps(actor), {
          mes,
          dictados: args.saldos,
          confirmado: args.confirmado,
          aceptoAjusteGrande: args.acepto_ajuste_grande,
        });
        const pendienteGrande = !result.guardado && args.confirmado && result.grandes.length > 0;
        return {
          mes,
          guardado: result.guardado,
          resumen: result.resumen,
          cuentas: result.lineas.map((linea) => ({
            cuenta: linea.cuenta,
            saldo_gestion: linea.saldoGestion,
            saldo_real: linea.saldoReal,
            diferencia: linea.diferencia,
            ajuste: linea.ajuste ? { tipo: linea.ajuste.type === "IN" ? "ingreso" : "salida", monto: linea.ajuste.amount } : null,
            ya_cerrada: linea.yaCerrada,
          })),
          cuentas_sin_saldo_dictado: result.faltan,
          siguiente_paso: result.guardado
            ? "Los ajustes YA quedaron guardados (no lo vuelvas a llamar). Dile al dueno la frase de 'resumen'."
            : pendienteGrande
              ? `NO se guardo: hay ajustes mayores a $${CIERRE_TOPE_AJUSTE.toLocaleString("es-CO")}. Preguntale al dueno si el saldo esta bien dictado; solo si lo confirma, llama otra vez con confirmado=true y acepto_ajuste_grande=true.`
              : "Repite el resumen al dueno y pregunta '¿Lo ajusto?'. Si dice si, llama UNA vez mas con los mismos datos y confirmado=true.",
        };
      } catch (error) {
        if (error instanceof CierreInputError) {
          throw new AsesorInputError(error.message);
        }
        throw error;
      }
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
  version: "1.3.0",
  instructions:
    "Servidor de consulta de Gestion (Magilus) que ademas registra gastos: ventas (pagadas y con saldo pendiente), abonos, cotizaciones, productos, margenes, comisiones, nomina, equipo (trabajadores activos y retirados), asistencia (quien esta trabajando hoy, entradas y salidas, dias trabajados), saldos de cuentas (y cierre de mes: cuadre con el banco), gastos del mes con la ganancia real (listar_gastos) y cuanto se le debe a cada proveedora orden por orden (deuda_con_proveedoras). Para entender el sistema completo usa primero que_es_esta_aplicacion. Todas las herramientas son de lectura salvo registrar_gasto y cerrar_mes, las unicas que escriben. cerrar_mes: el dueno dicta el saldo real de cada cuenta y se crea un ajuste por cuenta si no cuadra; SIEMPRE primero confirmado=false, repite el resumen y espera su 'si'. registrar_gasto: antes de guardar un gasto SIEMPRE repite el resumen al dueno y espera su 'si' (primero registrar_gasto con confirmado=false, luego confirmado=true), y el gasto queda guardado al confirmar (confirmado=true, UNA sola vez: dos llamadas crean dos gastos). La foto del soporte es opcional y NO se revisa: se sube despues por un enlace opcional. Moneda: pesos colombianos (COP). Fechas en formato AAAA-MM-DD. Las ventas cuentan cuando quedan pagadas por completo, aunque falte entregarlas, en el mes de ese pago; la contraentrega cuenta al entregarse (igual que la pantalla de Balances).",
  tools: asesorTools,
};
