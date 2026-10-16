"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getReceiptFile, saveExpenseReceipt } from "@/lib/expense-receipt";
import { prisma } from "@/lib/prisma";
import { createExpenseUseCase } from "@/modules/expenses/application/use-cases";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";
import { PAY_CURRENCIES, PAY_PERIODS, payrollMonthTag, type PayrollPersonConfig } from "@/modules/nomina/domain/payroll";
import { createPrismaNominaRepository } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import { regenerateSellerLink } from "@/modules/nomina/infrastructure/prisma-seller-portal";

// Nomina: solo el dueno/admin (mismo permiso que Comisiones).
const BASE_PATH = "/admin/comisiones/nomina";
const nomina = createPrismaNominaRepository();
const expenses = createPrismaExpensesRepository();

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function monthParam(formData: FormData): string {
  const value = field(formData, "mes");
  return /^\d{4}-\d{2}$/.test(value) ? value : "";
}

function back(formData: FormData, kind: "ok" | "error", message: string): never {
  const params = new URLSearchParams();
  const mes = monthParam(formData);
  if (mes) params.set("mes", mes);
  params.set(kind, message);
  redirect(`${BASE_PATH}?${params.toString()}`);
}

async function requireOwner(): Promise<string> {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAdminModuleAccess(session.user.id, session.user.role, "commissions"))
  ) {
    redirect("/unauthorized");
  }
  const user =
    (await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })) ??
    (session.user.email ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }) : null);
  if (!user) redirect("/login");
  return user.id;
}

function parseMoney(raw: string): number {
  // Acepta "50.000", "50,000", "50000" o "50.5" (dolares).
  const cleaned = raw.replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/[.,]/g, ""));
  return Number(cleaned.replace(",", "."));
}

const personSchema = z.object({
  userId: z.string().min(1, "Selecciona la persona"),
  period: z.enum(PAY_PERIODS),
  currency: z.enum(PAY_CURRENCIES),
  baseAmount: z.number().min(0, "El básico no puede ser negativo"),
  earnsCommission: z.boolean(),
});

export async function savePayrollPersonAction(formData: FormData): Promise<void> {
  await requireOwner();
  const parsed = personSchema.safeParse({
    userId: field(formData, "userId"),
    period: field(formData, "period"),
    currency: field(formData, "currency") || "COP",
    baseAmount: field(formData, "baseAmount") ? parseMoney(field(formData, "baseAmount")) : 0,
    earnsCommission: field(formData, "earnsCommission") === "on" || field(formData, "earnsCommission") === "true",
  });
  if (!parsed.success) back(formData, "error", parsed.error.issues[0]?.message ?? "Datos inválidos");
  const data = parsed.data;
  if (data.period !== "SIN_BASE" && (!Number.isFinite(data.baseAmount) || data.baseAmount <= 0)) {
    back(formData, "error", "Escribe el valor del básico (por quincena o por día).");
  }
  // Comision fija (vacio = regla general 10% primera venta / 15% desde la segunda).
  const pctRaw = field(formData, "commissionPct").replace("%", "").replace(",", ".");
  const commissionPct = pctRaw ? Number(pctRaw) : null;
  if (commissionPct !== null && (!Number.isFinite(commissionPct) || commissionPct <= 0 || commissionPct > 100)) {
    back(formData, "error", "La comisión fija debe ser un % entre 0 y 100 (o déjala vacía).");
  }
  const fromRaw = field(formData, "commissionFrom");
  const commissionFrom = /^\d{4}-\d{2}$/.test(fromRaw) ? fromRaw : monthParam(formData) || null;

  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true, email: true } });
  if (!user) back(formData, "error", "La persona no existe.");

  const person: PayrollPersonConfig = {
    userId: data.userId,
    period: data.period,
    currency: data.period === "SIN_BASE" ? "COP" : data.currency,
    baseAmount: data.period === "SIN_BASE" ? 0 : data.baseAmount,
    earnsCommission: data.earnsCommission,
    commissionPct: data.earnsCommission ? commissionPct : null,
    commissionFrom: data.earnsCommission && commissionPct !== null ? commissionFrom : null,
  };
  const config = await nomina.getConfig();
  const people = config.people.filter((item) => item.userId !== person.userId);
  await nomina.saveConfig({ ...config, people: [...people, person] });

  await logActivity({
    action: "UPDATE",
    entityType: "PAYROLL",
    entityId: person.userId,
    summary: `Configuró el salario de ${user.name ?? user.email} en nómina`,
  });
  revalidatePath(BASE_PATH);
  revalidatePath("/admin/comisiones");
  back(formData, "ok", "Salario guardado");
}

export async function removePayrollPersonAction(formData: FormData): Promise<void> {
  await requireOwner();
  const userId = field(formData, "userId");
  const config = await nomina.getConfig();
  await nomina.saveConfig({ ...config, people: config.people.filter((item) => item.userId !== userId) });
  await logActivity({ action: "DELETE", entityType: "PAYROLL", entityId: userId, summary: "Quitó a una persona de la nómina" });
  revalidatePath(BASE_PATH);
  back(formData, "ok", "Persona quitada de la nómina");
}

export async function savePayrollTrmAction(formData: FormData): Promise<void> {
  await requireOwner();
  const trm = parseMoney(field(formData, "trm"));
  if (!Number.isFinite(trm) || trm < 1000 || trm > 20000) {
    back(formData, "error", "Escribe la TRM en pesos por dólar (ej. 3900).");
  }
  const config = await nomina.getConfig();
  await nomina.saveConfig({ ...config, trm });
  await logActivity({ action: "UPDATE", entityType: "PAYROLL", entityId: null, summary: `Actualizó la TRM de nómina a $${trm}` });
  revalidatePath(BASE_PATH);
  back(formData, "ok", "TRM guardada");
}

export async function savePayrollDaysAction(formData: FormData): Promise<void> {
  await requireOwner();
  const mes = monthParam(formData);
  const userId = field(formData, "userId");
  const days = Number(field(formData, "days").replace(",", "."));
  if (!mes || !userId) back(formData, "error", "Datos inválidos");
  if (!Number.isFinite(days) || days < 0 || days > 31) back(formData, "error", "Los días deben estar entre 0 y 31.");
  const config = await nomina.getConfig();
  await nomina.saveConfig({
    ...config,
    daysByMonth: { ...config.daysByMonth, [mes]: { ...(config.daysByMonth[mes] ?? {}), [userId]: days } },
  });
  revalidatePath(BASE_PATH);
  back(formData, "ok", "Días guardados");
}

const CONCEPT_LABELS: Record<string, string> = {
  BASE_Q1: "Básico 1ª quincena",
  BASE_Q2: "Básico 2ª quincena",
  DIAS: "Días trabajados",
  COMISION: "Comisiones",
  BASE_Y_COMISION: "Básico + comisiones",
  OTRO: "Otro",
};

// Registra un pago de nomina como gasto de la categoria Nomina, desde la cuenta elegida:
// asi baja el saldo de esa cuenta y aparece en Gastos y en el cierre del mes.
export async function payPayrollAction(formData: FormData): Promise<void> {
  const createdById = await requireOwner();
  const employeeId = field(formData, "employeeId");
  const accountId = field(formData, "accountId");
  const amount = parseMoney(field(formData, "amount"));
  const dateRaw = field(formData, "date");
  const concept = field(formData, "concept");
  const note = field(formData, "note");
  const mes = monthParam(formData);

  if (!employeeId) back(formData, "error", "Falta la persona.");
  if (!accountId) back(formData, "error", "Elige la cuenta de donde sale el pago.");
  if (!Number.isFinite(amount) || amount <= 0) back(formData, "error", "El monto debe ser mayor a cero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) back(formData, "error", "Fecha inválida.");

  const [employee, account] = await Promise.all([
    prisma.user.findUnique({ where: { id: employeeId }, select: { name: true, email: true } }),
    prisma.account.findUnique({ where: { id: accountId }, select: { name: true, type: true, isActive: true } }),
  ]);
  if (!employee) back(formData, "error", "La persona no existe.");
  if (!account || !account.isActive) back(formData, "error", "La cuenta no existe o está inactiva.");

  // Misma regla de Gastos: comprobante obligatorio salvo en efectivo.
  let receipt: { url: string; name: string } | null = null;
  const file = getReceiptFile(formData);
  if (file) {
    try {
      receipt = await saveExpenseReceipt(file);
    } catch (error) {
      back(formData, "error", error instanceof Error ? error.message : "Comprobante inválido");
    }
  }
  if (!receipt && account.type !== "CASH") {
    back(formData, "error", "Adjunta el comprobante (es obligatorio salvo en efectivo).");
  }

  const categoryId = await nomina.ensurePayrollCategory(createdById);
  const conceptLabel = CONCEPT_LABELS[concept] ?? CONCEPT_LABELS.OTRO;
  // El mes de nomina va en la descripcion: asi un pago hecho despues (ej. comisiones del mes
  // anterior) cuenta en el mes al que corresponde.
  const periodLabel = mes ? ` ${payrollMonthTag(mes)}` : "";
  const description = `Nómina ${employee.name ?? employee.email}: ${conceptLabel}${periodLabel}${note ? ` — ${note}` : ""}`;

  const created = await createExpenseUseCase(expenses, {
    categoryId,
    accountId,
    amount,
    description: description.slice(0, 2000),
    reference: null,
    receiptUrl: receipt?.url ?? null,
    receiptName: receipt?.name ?? null,
    employeeId,
    // Mediodia UTC: la fecha de calendario no se corre de dia en Colombia.
    expenseDate: new Date(`${dateRaw}T12:00:00Z`),
    createdById,
  });

  await logActivity({
    action: "CREATE",
    entityType: "EXPENSE",
    entityId: created.id,
    summary: `Pagó nómina a ${employee.name ?? employee.email} por $${Math.round(amount).toLocaleString("es-CO")} desde ${account.name}`,
  });

  revalidatePath(BASE_PATH);
  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  back(formData, "ok", `Pago registrado desde ${account.name}`);
}

// Crea (o cambia) el link privado de comisiones de una persona. Cambiarlo invalida el anterior.
export async function regenerateSellerLinkAction(formData: FormData): Promise<void> {
  await requireOwner();
  const userId = field(formData, "userId");
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } }) : null;
  if (!user || user.role === "CLIENTE") back(formData, "error", "La persona no existe.");
  await regenerateSellerLink(userId);
  await logActivity({
    action: "UPDATE",
    entityType: "PAYROLL",
    entityId: userId,
    summary: `Generó el link de comisiones de ${user.name ?? user.email}`,
  });
  revalidatePath(BASE_PATH);
  back(formData, "ok", "Link listo para compartir");
}
