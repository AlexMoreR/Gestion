"use server";

import { canHardDelete, hasAnyModuleAccess } from "@/lib/admin-module-access";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { getActivityActor, logActivity, logActivityTx } from "@/lib/activity-log";
import { MOTIVO_ANULACION_ERROR, anularConMotivo, anularVarias, pagosPrimero } from "@/lib/anulaciones";
import { fullCopyForLog } from "@/lib/activity-log-snapshot";
import { stockToRestore } from "@/lib/order-stock-restore";
import { calculateQuoteLineTotal, stringifyQuoteItemMeta } from "@/lib/quote-item-meta";
import { prisma } from "@/lib/prisma";
import {
  MISSING_PAYMENT_METHOD_MESSAGE,
  MISSING_RECEIPT_MESSAGE,
  PAYMENT_METHOD_SHORT_LABEL,
  parsePaymentMethodInput,
  saleFromQuoteMissing,
} from "@/modules/ventas/domain/payment-method";
import { saleStatusForPaid } from "@/modules/ventas/domain/sale-paid-status";
import { CONSUMIDOR_FINAL_EMAIL } from "@/modules/ventas/domain/sale-origin";
import { saleItemsErrorMessage } from "@/modules/ventas/domain/sale-items-check";
import { autoCreateComboOrder } from "@/modules/ventas/application/auto-create-combo-order";
import {
  WITHHOLDING_LABEL,
  isWithholdingAccountValue,
  parseWithholdingCertificate,
} from "@/modules/ventas/domain/withholding";
import {
  MOTIVO_FIELD,
  esEdicionRetroactiva,
  esRetroactivo,
  exigirMotivoSiRetroactivo,
} from "@/modules/retroactivos/domain/retroactivo";
import {
  SESION_VENCIDA,
  datosRegistroRetroactivo,
  registrarRetroactivos,
  usuarioExiste,
  type RegistroRetroactivoInput,
} from "@/modules/retroactivos/infrastructure/registrar-retroactivo";

const createSaleSchema = z.object({
  quoteId: z.string().trim().min(1, "Quote is invalid"),
  discountAmount: z.coerce.number().min(0, "Discount cannot be negative").default(0),
});

const PAYMENT_RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["sales", "quotes"]))) {
    redirect("/unauthorized");
  }

  return session.user.id;
}

function getReturnTo(formData: FormData): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return "/admin/cotizaciones";
  }

  const value = raw.trim();
  return value || "/admin/cotizaciones";
}

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

function buildSaleCode(index: number): string {
  return `SAL-${String(index).padStart(5, "0")}`;
}

function parseSaleCodeNumber(code: string): number {
  const match = /^SAL-(\d+)$/.exec(code.trim());
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function getReceiptExtension(file: File): string {
  const fromName = path.extname(file.name).toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type === "application/pdf") {
    return ".pdf";
  }

  if (file.type === "image/jpeg") {
    return ".jpg";
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "image/webp") {
    return ".webp";
  }

  return "";
}

function validateReceiptFile(file: File): string | null {
  if (!(file instanceof File) || file.size <= 0) {
    return "No se pudo leer uno de los archivos adjuntos.";
  }

  if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return `El archivo ${file.name} supera el limite de 12 MB.`;
  }

  const extension = getReceiptExtension(file);
  const hasAllowedMime = ALLOWED_RECEIPT_MIME_TYPES.has(file.type);
  const hasAllowedExtension = ALLOWED_RECEIPT_EXTENSIONS.has(extension);

  if (!hasAllowedMime && !hasAllowedExtension) {
    return `El archivo ${file.name} no es compatible. Solo se aceptan JPG, PNG, WEBP o PDF.`;
  }

  return null;
}

async function savePaymentReceipt(
  file: File,
  saleCode: string,
  index: number,
): Promise<{ url: string; name: string; type: string }> {
  const validationError = validateReceiptFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "sales", "receipts");
  await mkdir(uploadDir, { recursive: true });

  const extension = getReceiptExtension(file) || ".png";
  const fileName = `${saleCode.toLowerCase()}-${String(index + 1).padStart(2, "0")}-${Date.now()}-${randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/sales/receipts/${fileName}`,
    name: normalizeReceiptName(file.name, fileName),
    type: file.type || (extension === ".pdf" ? "application/pdf" : "application/octet-stream"),
  };
}

type SalePaymentReceipt = {
  amount: number;
  paymentMethod: string;
  accountId: string;
  note: string | null;
  paymentDate: Date | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptType: string | null;
  size: number;
};

function normalizeReceiptName(name: string, fallback: string): string {
  const value = name.trim();
  return value || fallback;
}

async function getNextSaleCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastSale = await tx.sale.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });

  const baseCodeNumber = lastSale ? parseSaleCodeNumber(lastSale.code) : 0;
  const maxCodeAttempts = 30;

  for (let offset = 0; offset < maxCodeAttempts; offset += 1) {
    const code = buildSaleCode(baseCodeNumber + 1 + offset);
    const existing = await tx.sale.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate sale code");
}

// Combo Camillas: crea sola la orden de Laura. Si falla, la venta ya quedo guardada y
// la alerta del combo la muestra; aqui solo se registra el error.
async function comboOrderOkSuffix(saleId: string | null, actorId: string): Promise<string> {
  if (!saleId) return "";
  try {
    const result = await autoCreateComboOrder(saleId, actorId);
    if (!result.creada) return "";
    revalidatePath("/admin/ordenes");
    revalidatePath("/admin/produccion");
    return " · orden de Laura creada";
  } catch (error) {
    console.error("Combo Camillas: no se pudo crear la orden sola:", error);
    return "";
  }
}

export async function adminCreateSaleFromQuoteAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);
  let invoiceToken = "";

  const parsed = createSaleSchema.safeParse({
    quoteId: formData.get("quoteId"),
    discountAmount: formData.get("discountAmount"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, "Cotizacion invalida");
  }

  const paymentMethod = parsePaymentMethodInput(formData.get("paymentMethod"));
  if (paymentMethod === undefined) {
    redirectWithError(returnTo, "Forma de pago invalida");
  }
  // Caso SAL-00081: una cotizacion no pasa a venta sin forma de pago ni comprobante en cada abono.
  const missing = saleFromQuoteMissing({
    paymentMethod,
    installmentsHaveReceipt: formData
      .getAll("paymentReceipts")
      .map((entry) => entry instanceof File && entry.size > 0),
  });
  if (missing.length > 0) {
    redirectWithError(returnTo, missing.join(" "));
  }

  const quote = await prisma.quote.findUnique({
    where: { id: parsed.data.quoteId },
    include: {
      client: true,
      items: { include: { product: { select: { name: true, baseCost: true, additionalCost: true } } } },
      sale: true,
    },
  });

  if (!quote) {
    redirectWithError(returnTo, "No se encontro la cotizacion");
  }

  // Un empleado solo puede convertir en venta las cotizaciones que él creó.
  const sessionForOwnership = await auth();
  if (sessionForOwnership?.user?.role !== "ADMIN" && quote.createdById !== createdById) {
    redirectWithError(returnTo, "Solo puedes convertir tus propias cotizaciones");
  }

  if (quote.sale) {
    redirectWithError(returnTo, "Esta cotizacion ya fue enviada a ventas");
  }

  const itemsError = saleItemsErrorMessage(
    quote.items.map((item) => ({
      quantity: item.quantity,
      baseCost: Number(item.product.baseCost),
      additionalCost: Number(item.product.additionalCost),
      productName: item.product.name,
    })),
  );
  if (itemsError) {
    redirectWithError(returnTo, itemsError);
  }

  const grossTotal = Number(quote.total);
  const discountAmount = parsed.data.discountAmount ?? 0;
  if (discountAmount >= grossTotal) {
    redirectWithError(returnTo, "El descuento debe ser menor al total de la cotizacion");
  }

  const netTotal = Math.max(grossTotal - discountAmount, 0);
  const amountEntries = formData.getAll("paymentReceiptAmounts");
  const receiptEntries = formData.getAll("paymentReceipts");
  const receiptAccountEntries = formData.getAll("paymentReceiptAccounts");
  const receiptNoteEntries = formData.getAll("paymentReceiptNotes");
  const receiptDateEntries = formData.getAll("paymentReceiptDates");

  if (amountEntries.length === 0) {
    redirectWithError(returnTo, "Debes registrar al menos un abono");
  }

  if (
    amountEntries.length !== receiptAccountEntries.length ||
    amountEntries.length !== receiptNoteEntries.length ||
    amountEntries.length !== receiptEntries.length
  ) {
    redirectWithError(returnTo, "Faltan datos de uno o mas abonos");
  }

  const activeAccounts = await prisma.account.findMany({
    where: { isActive: true, type: { not: "OWNER" } },
    select: { id: true, name: true, type: true },
  });
  const accountById = new Map(activeAccounts.map((account) => [account.id, account]));

  const installments = amountEntries.map((amountEntry, index) => {
    const amount = typeof amountEntry === "string" ? Number(amountEntry) : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      redirectWithError(returnTo, "Cada abono necesita un monto valido");
    }

    const accountEntry = receiptAccountEntries[index];
    const accountId = typeof accountEntry === "string" ? accountEntry.trim() : "";
    const account = accountId ? accountById.get(accountId) : undefined;
    if (!account) {
      redirectWithError(returnTo, "Cada abono necesita un medio de pago valido");
    }

    const noteValue = receiptNoteEntries[index];
    const note = typeof noteValue === "string" ? noteValue.trim() : "";

    const dateValue = receiptDateEntries[index];
    const rawDate = typeof dateValue === "string" ? dateValue.trim() : "";
    let paymentDate: Date | null = null;
    if (rawDate) {
      const parsedDate = new Date(`${rawDate}T12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) {
        redirectWithError(returnTo, "La fecha de uno de los abonos es invalida");
      }
      paymentDate = parsedDate;
    }

    const fileEntry = receiptEntries[index];
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (!file) {
      redirectWithError(returnTo, MISSING_RECEIPT_MESSAGE);
    }

    const validationError = validateReceiptFile(file);
    if (validationError) {
      redirectWithError(returnTo, validationError);
    }

    return {
      amount,
      paymentMethod: account.name,
      accountId: account.id,
      note: note || null,
      paymentDate,
      rawDate,
      file,
    };
  });

  // Retroactivo: algun abono (y por tanto la venta, que toma la fecha del mas temprano) con
  // fecha de un dia anterior a hoy. Exige motivo.
  const registroAhora = new Date();
  const retroInstallmentIndexes = installments
    .map((installment, index) => (esRetroactivo(installment.rawDate || null, registroAhora) ? index : -1))
    .filter((index) => index >= 0);
  const motivoCheck = exigirMotivoSiRetroactivo(retroInstallmentIndexes.length > 0, formData.get(MOTIVO_FIELD));
  if (!motivoCheck.ok) {
    redirectWithError(returnTo, motivoCheck.error);
  }
  const earliestRawDate = installments
    .map((installment) => installment.rawDate)
    .filter(Boolean)
    .sort()[0];

  const totalDownPayment = installments.reduce((sum, installment) => sum + installment.amount, 0);
  if (totalDownPayment <= 0) {
    redirectWithError(returnTo, "Debes registrar al menos un abono valido");
  }

  // La fecha de la venta es la del abono mas temprano.
  const installmentDates = installments
    .map((installment) => installment.paymentDate)
    .filter((date): date is Date => date instanceof Date);
  const saleCreatedAt =
    installmentDates.length > 0
      ? new Date(Math.min(...installmentDates.map((date) => date.getTime())))
      : undefined;

  if (totalDownPayment > netTotal) {
    redirectWithError(returnTo, "La suma de los abonos no puede superar el total real de la venta");
  }

  const savedReceipts = await Promise.all(
    installments.map(async ({ amount, paymentMethod, accountId, note, paymentDate, file }, index) => {
      if (!file) {
        return {
          amount,
          paymentMethod,
          accountId,
          note,
          paymentDate,
          receiptUrl: null,
          receiptName: null,
          receiptType: null,
          size: 0,
        } satisfies SalePaymentReceipt;
      }

      const savedReceipt = await savePaymentReceipt(file, quote.code, index);
      return {
        amount,
        paymentMethod,
        accountId,
        note,
        paymentDate,
        receiptUrl: savedReceipt.url,
        receiptName: savedReceipt.name,
        receiptType: savedReceipt.type,
        size: file.size,
      } satisfies SalePaymentReceipt;
    }),
  );

  let createdSaleCode: string | null = null;
  let createdSaleId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const saleCode = await getNextSaleCode(tx);
      createdSaleCode = saleCode;
      invoiceToken = randomUUID().replace(/-/g, "");
      const primaryReceipt = savedReceipts.find((receipt) => Boolean(receipt.receiptUrl)) ?? savedReceipts[0];

      const createdSale = await tx.sale.create({
        data: {
          code: saleCode,
          quoteId: quote.id,
          clientId: quote.clientId,
          createdById,
          // Si la venta nace ya pagada por completo, se factura de una vez
          // (misma regla que la ruta de abonos posteriores).
          status: saleStatusForPaid(totalDownPayment, netTotal, "ACTIVE"),
          paymentMethod,
          // Origen: se copia el que el CRM aviso para la cotizacion (al marcar GANADO). Si
          // el aviso llega despues, /api/ventas/origen actualiza tambien la venta.
          ...(quote.origin ? { origin: quote.origin } : {}),
          ...(quote.originDetail != null ? { originDetail: quote.originDetail as Prisma.InputJsonValue } : {}),
          ...(saleCreatedAt ? { createdAt: saleCreatedAt } : {}),
          registradoEn: registroAhora,
          downPaymentAmount: totalDownPayment,
          grossTotal,
          discountAmount,
          paymentReceiptUrl: primaryReceipt?.receiptUrl ?? "",
          paymentReceiptName: primaryReceipt?.receiptName ?? "",
          paymentReceiptType: primaryReceipt?.receiptType ?? "",
          salePayments: {
            create: savedReceipts.map((receipt, index) => ({
              amount: receipt.amount,
              paymentMethod: receipt.paymentMethod,
              accountId: receipt.accountId,
              note: receipt.note,
              paymentDate: receipt.paymentDate,
              receiptUrl: receipt.receiptUrl,
              receiptName: receipt.receiptName,
              receiptType: receipt.receiptType,
              sortOrder: index,
              createdById,
            })),
          },
          paymentReceipts: savedReceipts,
          invoiceToken,
          subtotal: quote.subtotal,
          total: netTotal,
        } satisfies Prisma.SaleUncheckedCreateInput,
        select: { id: true, salePayments: { select: { id: true, sortOrder: true } } },
      });
      createdSaleId = createdSale.id;

      if (motivoCheck.motivo && earliestRawDate) {
        const paymentIdBySort = new Map(createdSale.salePayments.map((payment) => [payment.sortOrder, payment.id]));
        const retroRows: RegistroRetroactivoInput[] = [
          {
            tipo: "VENTA",
            registroId: createdSale.id,
            fechaPuesta: earliestRawDate,
            usuarioId: createdById,
            motivo: motivoCheck.motivo,
            monto: netTotal,
          },
        ];
        for (const index of retroInstallmentIndexes) {
          const paymentId = paymentIdBySort.get(index);
          if (!paymentId) continue;
          retroRows.push({
            tipo: "ABONO",
            registroId: paymentId,
            fechaPuesta: installments[index].rawDate,
            usuarioId: createdById,
            motivo: motivoCheck.motivo,
            monto: installments[index].amount,
          });
        }
        await registrarRetroactivos(tx, retroRows);
      }

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: "ACCEPTED" },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Esta cotizacion ya fue enviada a ventas");
    }

    console.error("Failed to create sale:", error);
    redirectWithError(returnTo, "No se pudo crear el registro de venta");
  }

  await logActivity({
    action: "CREATE",
    entityType: "SALE",
    entityId: createdSaleId,
    summary: createdSaleCode
      ? `Creó la venta ${createdSaleCode} desde la cotización ${quote.code}`
      : `Creó una venta desde la cotización ${quote.code}`,
  });

  const comboOk = await comboOrderOkSuffix(createdSaleId, createdById);

  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  if (invoiceToken) {
    revalidatePath(`/sales/${invoiceToken}`);
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: `Venta creada${comboOk}` }).toString()}`);
}

const addSalePaymentSchema = z.object({
  saleId: z.string().trim().min(1, "Venta invalida"),
  amount: z.coerce.number().positive("El monto del abono debe ser mayor a cero"),
  paymentDate: z.coerce.date().optional(),
});

export async function adminAddSalePaymentAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = addSalePaymentSchema.safeParse({
    saleId: formData.get("saleId"),
    amount: formData.get("amount"),
    paymentDate: formData.get("paymentDate") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos del abono invalidos");
  }

  // Retroactivo: abono con fecha de un dia anterior a hoy (hora Colombia). Exige motivo.
  const paymentDateRawValue = formData.get("paymentDate");
  const paymentDateRaw = typeof paymentDateRawValue === "string" ? paymentDateRawValue.trim() : "";
  const motivoCheck = exigirMotivoSiRetroactivo(
    esRetroactivo(paymentDateRaw || parsed.data.paymentDate || null),
    formData.get(MOTIVO_FIELD),
  );
  if (!motivoCheck.ok) {
    redirectWithError(returnTo, motivoCheck.error);
  }
  // Quien registra el abono (NULL si la sesion apunta a un usuario que ya no existe).
  const paymentCreatedById = (await usuarioExiste(prisma, createdById)) ? createdById : null;
  if (motivoCheck.motivo && !paymentCreatedById) {
    redirectWithError(returnTo, SESION_VENCIDA);
  }

  const accountIdValue = formData.get("accountId");
  const accountId = typeof accountIdValue === "string" ? accountIdValue.trim() : "";
  if (!accountId) {
    redirectWithError(returnTo, "Selecciona una cuenta de balance valida");
  }

  // Retencion en la fuente: cuenta como pagado pero no entra a ninguna cuenta ni exige comprobante.
  const isWithholding = isWithholdingAccountValue(accountId);
  const certificateCheck = parseWithholdingCertificate(isWithholding ? formData.get("withholdingCertificate") : "");
  if (!certificateCheck.ok) {
    redirectWithError(returnTo, certificateCheck.error);
  }
  const withholdingCertificate = certificateCheck.certificate;

  const noteValue = formData.get("note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  const fileEntry = formData.get("receipt");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  const [account, sale] = await Promise.all([
    isWithholding
      ? Promise.resolve(null)
      : prisma.account.findFirst({
          where: { id: accountId, isActive: true, type: { not: "OWNER" } },
          select: { id: true, name: true, type: true },
        }),
    prisma.sale.findUnique({
      where: { id: parsed.data.saleId },
      include: { salePayments: true },
    }),
  ]);

  if (!isWithholding && !account) {
    redirectWithError(returnTo, "Selecciona una cuenta de balance valida");
  }

  if (account && account.type !== "CASH" && !file) {
    redirectWithError(returnTo, "Los abonos que no sean en efectivo deben incluir comprobante");
  }

  if (file) {
    const validationError = validateReceiptFile(file);
    if (validationError) {
      redirectWithError(returnTo, validationError);
    }
  }

  if (!sale) {
    redirectWithError(returnTo, "No se encontro la venta");
  }

  if (sale.status === "CANCELLED") {
    redirectWithError(returnTo, "No se pueden registrar abonos en una venta cancelada");
  }

  const capital = Number(sale.total);
  const alreadyPaid = sale.salePayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const remaining = Math.max(capital - alreadyPaid, 0);

  if (parsed.data.amount > remaining + 0.0001) {
    redirectWithError(returnTo, "El abono supera el saldo pendiente de la venta");
  }

  // Evita abonos duplicados por doble/triple clic: si ya existe un abono identico
  // (mismo monto y medio de pago) creado hace muy poco, se ignora el repetido.
  const DUPLICATE_WINDOW_MS = 20_000;
  const now = Date.now();
  const hasRecentDuplicate = sale.salePayments.some(
    (payment) =>
      Number(payment.amount ?? 0) === parsed.data.amount &&
      payment.accountId === (account?.id ?? null) &&
      payment.isWithholding === isWithholding &&
      payment.createdAt instanceof Date &&
      now - payment.createdAt.getTime() < DUPLICATE_WINDOW_MS,
  );
  const okMessage = isWithholding ? "Retención en la fuente registrada" : "Abono registrado";
  if (hasRecentDuplicate) {
    redirect(`${returnTo}?${new URLSearchParams({ ok: okMessage }).toString()}`);
  }

  const nextSortOrder = sale.salePayments.reduce((max, payment) => Math.max(max, payment.sortOrder + 1), sale.salePayments.length);

  let savedReceipt: { url: string; name: string; type: string } | null = null;
  if (file) {
    savedReceipt = await savePaymentReceipt(file, sale.code, nextSortOrder);
  }

  const newTotalPaid = alreadyPaid + parsed.data.amount;

  try {
    await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount: parsed.data.amount,
          paymentMethod: account?.name ?? WITHHOLDING_LABEL,
          accountId: account?.id ?? null,
          isWithholding,
          withholdingCertificate: isWithholding ? withholdingCertificate : null,
          paymentDate: parsed.data.paymentDate ?? new Date(),
          note: note || null,
          receiptUrl: savedReceipt?.url ?? null,
          receiptName: savedReceipt?.name ?? null,
          receiptType: savedReceipt?.type ?? null,
          sortOrder: nextSortOrder,
          createdById: paymentCreatedById,
        },
        select: { id: true },
      });

      if (motivoCheck.motivo) {
        await registrarRetroactivos(tx, [
          {
            tipo: "ABONO",
            registroId: createdPayment.id,
            fechaPuesta: paymentDateRaw || (parsed.data.paymentDate as Date),
            usuarioId: paymentCreatedById as string,
            motivo: motivoCheck.motivo,
            monto: parsed.data.amount,
          },
        ]);
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          downPaymentAmount: newTotalPaid,
          status: saleStatusForPaid(newTotalPaid, capital, sale.status),
        },
      });
    });
  } catch (error) {
    console.error("Failed to add sale payment:", error);
    redirectWithError(returnTo, "No se pudo registrar el abono");
  }

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/ventas/retenciones");
  revalidatePath(`/sales/${sale.invoiceToken}`);
  redirect(`${returnTo}?${new URLSearchParams({ ok: okMessage }).toString()}`);
}

const voidSalePaymentSchema = z.object({
  paymentId: z.string().trim().min(1, "Abono invalido"),
  motivo: z
    .string()
    .trim()
    .min(3, MOTIVO_ANULACION_ERROR)
    .max(300, "El motivo puede tener máximo 300 caracteres"),
});

// Anular abono: lo que tiene plata no se borra sin motivo; la copia queda en RegistroAnulado.
export async function adminVoidSalePaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = voidSalePaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
    motivo: formData.get("motivo") ?? "",
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Abono invalido");
  }

  const payment = await prisma.salePayment.findUnique({
    where: { id: parsed.data.paymentId },
    include: { sale: { include: { salePayments: true } }, account: { select: { name: true } } },
  });

  if (!payment) {
    redirectWithError(returnTo, "No se encontro el abono");
  }
  const actor = await getActivityActor();

  const { sale, account, ...paymentRow } = payment;
  const capital = Number(sale.total);
  const newTotalPaid = sale.salePayments
    .filter((item) => item.id !== payment.id)
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  try {
    await prisma.$transaction(async (tx) => {
      await anularConMotivo(tx, {
        tabla: "SalePayment",
        registro: { ...paymentRow, accountName: account?.name ?? null },
        codigo: sale.code,
        monto: payment.amount,
        motivo: parsed.data.motivo,
        usuarioId: actor.id,
        usuarioNombre: actor.name || actor.email,
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          downPaymentAmount: newTotalPaid,
          // Si queda saldo pendiente, la venta pagada vuelve a activa.
          status: saleStatusForPaid(newTotalPaid, capital, sale.status),
        },
      });
    });
  } catch (error) {
    console.error("Failed to void sale payment:", error);
    redirectWithError(returnTo, "No se pudo anular el abono");
  }

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/ventas/retenciones");
  revalidatePath(`/sales/${sale.invoiceToken}`);
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Abono anulado" }).toString()}`);
}

const cancelSaleSchema = z.object({
  saleId: z.string().trim().min(1, "Venta invalida"),
  motivo: z
    .string()
    .trim()
    .min(3, "Escribe el motivo (mínimo 3 letras)")
    .max(300, "El motivo puede tener máximo 300 caracteres"),
});

function revalidateSaleScreens() {
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/produccion");
  revalidatePath("/admin/despachos");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/balances");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/configuracion/actividad");
}

// Anular venta: la venta y su orden quedan CANCELLED con el motivo; no se borra nada
// (abonos, fletes, cargos/pagos a proveedora y despachos siguen ahí y se ven por su código).
export async function adminCancelSaleAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = cancelSaleSchema.safeParse({
    saleId: formData.get("saleId"),
    motivo: formData.get("motivo") ?? "",
  });
  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Venta invalida");
  }
  const { motivo } = parsed.data;

  let actor;
  try {
    actor = await getActivityActor();
  } catch {
    redirect("/unauthorized");
  }

  let error: string | null = null;
  try {
    error = await prisma.$transaction(async (tx) => {
      // Lectura dentro de la transacción con candado: dos clics no anulan dos veces.
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${parsed.data.saleId} FOR UPDATE`;
      const sale = await tx.sale.findUnique({
        where: { id: parsed.data.saleId },
        select: {
          id: true,
          code: true,
          status: true,
          order: {
            select: {
              id: true,
              code: true,
              status: true,
              items: { select: { productId: true, quantity: true, fulfillmentMode: true, confirmedAt: true } },
            },
          },
        },
      });
      if (!sale) return "No se encontro la venta";
      if (sale.status === "CANCELLED") return `La venta ${sale.code} ya está anulada`;

      await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });

      const order = sale.order;
      // Si la orden ya estaba cancelada, su stock ya se repuso: no se toca otra vez.
      const cancelOrder = order && order.status !== "CANCELLED";
      if (cancelOrder) {
        await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "CANCELLED",
            note: `Venta ${sale.code} anulada. Motivo: ${motivo}`,
            changedById,
          },
        });
        const restore = stockToRestore(order.items);
        if (restore.size > 0) {
          await tx.inventoryMovement.createMany({
            data: Array.from(restore.entries()).map(([productId, quantity]) => ({
              productId,
              type: "IN" as const,
              change: quantity,
              note: `Reversa por anulación de venta ${sale.code}`,
              createdById: changedById,
            })),
          });
        }
      }

      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "SALE",
        entityId: sale.id,
        entityCode: sale.code,
        summary: `Anuló la venta ${sale.code}. Motivo: ${motivo}`,
        before: { saleStatus: sale.status, orderCode: order?.code ?? null, orderStatus: order?.status ?? null },
        after: {
          saleStatus: "CANCELLED",
          orderCode: order?.code ?? null,
          orderStatus: order ? "CANCELLED" : null,
          motivo,
        },
      });
      return null;
    });
  } catch (err) {
    console.error("Failed to cancel sale:", err);
    redirectWithError(returnTo, "No se pudo anular la venta");
  }
  if (error) {
    redirectWithError(returnTo, error);
  }

  revalidateSaleScreens();
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Venta anulada" }).toString()}`);
}

// Borrado definitivo: lo que hacía antes "Eliminar venta". Solo el dueño (permiso hard_delete).
// Antes de borrar guarda la copia completa en la bitácora, en la misma transacción.
export async function adminHardDeleteSaleAction(formData: FormData): Promise<void> {
  const session = await auth();
  const returnTo = getReturnTo(formData);
  if (!session?.user?.id || !(await canHardDelete(session.user.id, session.user.role))) {
    redirectWithError(returnTo, "Solo el dueño puede borrar una venta definitivamente.");
  }
  const deletedById = session.user.id;

  const parsed = cancelSaleSchema.safeParse({
    saleId: formData.get("saleId"),
    motivo: formData.get("motivo") ?? "",
  });
  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Venta invalida");
  }
  const { motivo } = parsed.data;

  let actor;
  try {
    actor = await getActivityActor();
  } catch {
    redirect("/unauthorized");
  }

  let saleCode: string | null = null;
  try {
    saleCode = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: parsed.data.saleId },
        include: {
          salePayments: true,
          shippingCosts: true,
          order: { include: { items: true, history: true, dispatches: { include: { items: true } } } },
        },
      });
      if (!sale) return null;
      const orderId = sale.order?.id ?? null;
      const linked = await tx.supplierLedgerEntry.findMany({
        where: { OR: [{ saleId: sale.id }, ...(orderId ? [{ orderId }] : [])] },
        select: { id: true },
      });
      // También los abonos que saldan esos cargos: si no, se irían en cascada sin dejar copia.
      const supplierEntries = await tx.supplierLedgerEntry.findMany({
        where: {
          OR: [
            { id: { in: linked.map((row) => row.id) } },
            { type: "PAYMENT", settlesEntryId: { in: linked.map((row) => row.id) } },
          ],
        },
      });
      const anulacion = { motivo, usuarioId: deletedById, usuarioNombre: actor.name || actor.email };

      // 0. Copia completa en la bitácora: si no se puede anotar, no se borra nada.
      await logActivityTx(tx, actor, {
        action: "DELETE",
        entityType: "SALE",
        entityId: sale.id,
        entityCode: sale.code,
        summary: `Borró definitivamente la venta ${sale.code}. Motivo: ${motivo}`,
        before: fullCopyForLog({ ...sale, supplierLedgerEntries: supplierEntries }),
        after: { motivo },
      });

      // 1. Anula (copia + borrado) los cargos y pagos a proveedores ligados a la venta o su orden.
      //    Al desaparecer, los saldos de proveedores y cuentas se recalculan solos.
      await anularVarias(tx, "SupplierLedgerEntry", pagosPrimero(supplierEntries), {
        ...anulacion,
        codigo: (row) => (row.code as string | null) ?? sale.code,
      });

      if (sale.order) {
        // 2. Repone al inventario lo que la orden habia descontado (si la orden ya estaba
        //    cancelada, ese stock ya se repuso al anular).
        const restore = sale.order.status === "CANCELLED" ? new Map<string, number>() : stockToRestore(sale.order.items);
        if (restore.size > 0) {
          await tx.inventoryMovement.createMany({
            data: Array.from(restore.entries()).map(([productId, quantity]) => ({
              productId,
              type: "IN" as const,
              change: quantity,
              note: `Reversa por eliminacion de venta ${sale.code}`,
              createdById: deletedById,
            })),
          });
        }

        // 3. Anula los despachos (cascade -> items de despacho). Esto libera el
        //    Restrict que impide borrar los items de la orden si tienen despacho.
        await anularVarias(
          tx,
          "Dispatch",
          sale.order.dispatches.map((row) => ({ ...row, amount: row.shippingCost })),
          anulacion,
        );

        // 4. Anula la orden: cascade elimina items, fotos, producción e historial (van en la copia).
        const productionJobs = await tx.productionJob.findMany({ where: { orderId: sale.order.id } });
        await anularVarias(tx, "Order", [{ ...sale.order, productionJobs }], anulacion);
      }

      // 5. Anula los abonos y fletes (uno por uno, con su copia) y luego la venta.
      //    La cotización origen se conserva.
      await anularVarias(tx, "SalePayment", sale.salePayments, { ...anulacion, codigo: () => sale.code });
      await anularVarias(tx, "ShippingCost", sale.shippingCosts, { ...anulacion, codigo: () => sale.code });
      await anularVarias(tx, "Sale", [sale], anulacion);
      return sale.code;
    });
  } catch (error) {
    console.error("Failed to hard delete sale:", error);
    redirectWithError(returnTo, "No se pudo borrar la venta");
  }
  if (!saleCode) {
    redirectWithError(returnTo, "No se encontro la venta");
  }

  revalidateSaleScreens();
  redirect(`${returnTo}?${new URLSearchParams({ ok: `Venta ${saleCode} borrada definitivamente` }).toString()}`);
}

// ─── VENTA DIRECTA (mostrador, sin cotizacion previa) ──────────────────────

// Correo centinela del cliente generico unico para ventas de mostrador (CONSUMIDOR_FINAL_EMAIL,
// compartido con el origen de ventas para no tratarlo como un cliente recurrente).

function buildQuoteCode(index: number): string {
  return `COT-${String(index).padStart(5, "0")}`;
}

function parseQuoteCodeNumber(code: string): number {
  const match = /^COT-(\d+)$/.exec(code.trim());
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

async function getNextQuoteCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastQuote = await tx.quote.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });
  const baseCodeNumber = lastQuote ? parseQuoteCodeNumber(lastQuote.code) : 0;

  for (let offset = 0; offset < 30; offset += 1) {
    const code = buildQuoteCode(baseCodeNumber + 1 + offset);
    const existing = await tx.quote.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate quote code");
}

const directSaleItemSchema = z.object({
  productId: z.string().trim().min(1, "Producto invalido"),
  quantity: z.coerce.number().int().min(1, "Cantidad invalida").max(10000),
  unitPrice: z.coerce.number().positive("Precio invalido"),
  description: z.string().trim().max(4000).optional().default(""),
});

export async function adminCreateDirectSaleAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);
  let invoiceToken = "";

  const getTrimmed = (key: string): string => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  // Modo de cliente: "final" (Consumidor final), "existing" (cliente existente) o "new" (cliente nuevo)
  const clientModeRaw = getTrimmed("clientMode");
  const clientMode: "final" | "existing" | "new" =
    clientModeRaw === "existing" || clientModeRaw === "new" ? clientModeRaw : "final";

  const existingClientId = getTrimmed("clientId");

  const newClientName = getTrimmed("clientName");
  const newClientPhone = getTrimmed("clientPhone");
  const newClientAddress = getTrimmed("clientAddress");
  const newClientDocument = getTrimmed("clientDocument");
  const newClientEmail = getTrimmed("clientEmail");

  if (clientMode === "existing" && !existingClientId) {
    redirectWithError(returnTo, "Selecciona un cliente existente");
  }

  const paymentMethod = parsePaymentMethodInput(formData.get("paymentMethod"));
  if (paymentMethod === undefined) {
    redirectWithError(returnTo, "Forma de pago invalida");
  }

  if (clientMode === "new") {
    if (!newClientName) {
      redirectWithError(returnTo, "El nombre del cliente es obligatorio");
    }
    if (!newClientPhone) {
      redirectWithError(returnTo, "El telefono del cliente es obligatorio");
    }
    if (!newClientAddress) {
      redirectWithError(returnTo, "La direccion del cliente es obligatoria");
    }
  }

  // Items en arreglos paralelos
  const productIdsRaw = formData.getAll("itemProductIds");
  const quantitiesRaw = formData.getAll("itemQuantities");
  const unitPricesRaw = formData.getAll("itemUnitPrices");
  const descriptionsRaw = formData.getAll("itemDescriptions");

  if (productIdsRaw.length === 0) {
    redirectWithError(returnTo, "Debes agregar al menos un producto");
  }

  if (
    productIdsRaw.length !== quantitiesRaw.length ||
    productIdsRaw.length !== unitPricesRaw.length
  ) {
    redirectWithError(returnTo, "Faltan datos de uno o mas productos");
  }

  const parsedItems = productIdsRaw.map((productId, index) => {
    const parsed = directSaleItemSchema.safeParse({
      productId,
      quantity: quantitiesRaw[index],
      unitPrice: unitPricesRaw[index],
      description: descriptionsRaw[index] ?? "",
    });
    if (!parsed.success) {
      redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Producto invalido");
    }
    return parsed.data;
  });

  const productIds = Array.from(new Set(parsedItems.map((item) => item.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, baseCost: true, additionalCost: true },
  });
  if (products.length !== productIds.length) {
    redirectWithError(returnTo, "Uno o mas productos no existen");
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const directItemsError = saleItemsErrorMessage(
    parsedItems.map((item) => {
      const product = productById.get(item.productId)!;
      return {
        quantity: item.quantity,
        baseCost: Number(product.baseCost),
        additionalCost: Number(product.additionalCost),
        productName: product.name,
      };
    }),
  );
  if (directItemsError) {
    redirectWithError(returnTo, directItemsError);
  }

  const normalizedItems = parsedItems.map((item) => {
    const lineTotal = calculateQuoteLineTotal(item.quantity, item.unitPrice, 0, 0);
    const notes = stringifyQuoteItemMeta({
      color: "",
      description: item.description ?? "",
      additionalCost: 0,
      discount: 0,
    });
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal,
      notes,
    };
  });

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const total = subtotal;

  // Fecha de la venta (editable para cargar meses anteriores). Si no viene, se usa
  // la fecha actual por defecto. Sobrescribe createdAt para que la analitica de
  // Balances ubique la venta en su mes real.
  const saleDateRaw = getTrimmed("saleDate");
  let saleDate: Date | undefined;
  if (saleDateRaw) {
    const parsedSaleDate = new Date(`${saleDateRaw}T12:00:00`);
    if (Number.isNaN(parsedSaleDate.getTime())) {
      redirectWithError(returnTo, "La fecha de la venta es invalida");
    }
    saleDate = parsedSaleDate;
  }

  // Retroactivo: venta con fecha de un dia anterior a hoy (hora Colombia). Exige motivo.
  const registroAhora = new Date();
  const motivoCheck = exigirMotivoSiRetroactivo(
    esRetroactivo(saleDateRaw || null, registroAhora),
    formData.get(MOTIVO_FIELD),
  );
  if (!motivoCheck.ok) {
    redirectWithError(returnTo, motivoCheck.error);
  }

  // Abono inicial opcional
  const amountRaw = formData.get("amount");
  const hasInitialPayment = typeof amountRaw === "string" && amountRaw.trim() !== "" && Number(amountRaw) > 0;

  let initialPayment: {
    amount: number;
    paymentMethod: string;
    accountId: string;
    note: string | null;
    receipt: { url: string; name: string; type: string } | null;
  } | null = null;

  if (hasInitialPayment) {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      redirectWithError(returnTo, "El monto del abono debe ser mayor a cero");
    }
    if (amount > total + 0.0001) {
      redirectWithError(returnTo, "El abono no puede superar el total de la venta");
    }

    const accountId = getTrimmed("accountId");
    if (!accountId) {
      redirectWithError(returnTo, "Selecciona una cuenta de balance valida");
    }

    const account = await prisma.account.findFirst({
      where: { id: accountId, isActive: true, type: { not: "OWNER" } },
      select: { id: true, name: true, type: true },
    });
    if (!account) {
      redirectWithError(returnTo, "Selecciona una cuenta de balance valida");
    }

    const noteValue = formData.get("note");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";

    const fileEntry = formData.get("receipt");
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (account.type !== "CASH" && !file) {
      redirectWithError(returnTo, "Los abonos que no sean en efectivo deben incluir comprobante");
    }

    let savedReceipt: { url: string; name: string; type: string } | null = null;
    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        redirectWithError(returnTo, validationError);
      }
      savedReceipt = await savePaymentReceipt(file, "venta-directa", 0);
    }

    initialPayment = {
      amount,
      paymentMethod: account.name,
      accountId: account.id,
      note: note || null,
      receipt: savedReceipt,
    };
  }

  const downPaymentAmount = initialPayment?.amount ?? 0;

  let createdSaleCode: string | null = null;
  let createdSaleId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      let client: { id: string };

      if (clientMode === "existing") {
        // Cliente ya registrado: validamos que exista y sea cliente
        const found = await tx.user.findFirst({
          where: { id: existingClientId, role: Role.CLIENTE },
          select: { id: true },
        });
        if (!found) {
          throw new Error("CLIENT_NOT_FOUND");
        }
        client = found;
      } else if (clientMode === "new") {
        // Cliente nuevo reutilizable: si el correo ya existe lo reutilizamos, si no lo creamos
        const email = newClientEmail
          ? newClientEmail.toLowerCase()
          : `cliente-${randomUUID().replace(/-/g, "").slice(0, 18)}@magilus.local`;
        const existingByEmail = newClientEmail
          ? await tx.user.findUnique({ where: { email }, select: { id: true } })
          : null;
        if (existingByEmail) {
          client = await tx.user.update({
            where: { id: existingByEmail.id },
            data: {
              role: Role.CLIENTE,
              name: newClientName,
              phone: newClientPhone,
              address: newClientAddress,
              document: newClientDocument || undefined,
            },
            select: { id: true },
          });
        } else {
          const hashedPassword = await bcrypt.hash(randomUUID().replace(/-/g, "").slice(0, 14), 12);
          client = await tx.user.create({
            data: {
              name: newClientName,
              email,
              phone: newClientPhone,
              address: newClientAddress,
              document: newClientDocument || undefined,
              role: Role.CLIENTE,
              password: hashedPassword,
            },
            select: { id: true },
          });
        }
      } else {
        // Consumidor final: registro generico unico (singleton) reutilizado por todas
        // las ventas de mostrador. No guarda datos propios; la trazabilidad por venta
        // vive en la venta/cotizacion, no en el cliente.
        const hashedPassword = await bcrypt.hash(randomUUID().replace(/-/g, "").slice(0, 14), 12);
        client = await tx.user.upsert({
          where: { email: CONSUMIDOR_FINAL_EMAIL },
          update: {},
          create: {
            name: "Consumidor final",
            email: CONSUMIDOR_FINAL_EMAIL,
            role: Role.CLIENTE,
            password: hashedPassword,
          },
          select: { id: true },
        });
      }

      // Cotizacion interna (para mantener la estructura factura -> cotizacion)
      const quoteCode = await getNextQuoteCode(tx);
      const shareToken = randomUUID().replace(/-/g, "");
      const quote = await tx.quote.create({
        data: {
          code: quoteCode,
          clientId: client.id,
          createdById,
          status: "ACCEPTED",
          // Venta directa: no hay chat ni cotizacion previa, asi que el origen es MOSTRADOR.
          // Si el CRM luego avisa un origen para este COT, lo sobrescribe (el ultimo aviso manda).
          origin: "MOSTRADOR",
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          shareToken,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              lineTotal: new Prisma.Decimal(item.lineTotal),
              notes: item.notes,
            })),
          },
        },
        select: { id: true },
      });

      const saleCode = await getNextSaleCode(tx);
      createdSaleCode = saleCode;
      invoiceToken = randomUUID().replace(/-/g, "");

      const createdSale = await tx.sale.create({
        data: {
          code: saleCode,
          quoteId: quote.id,
          clientId: client.id,
          createdById,
          // Si la venta nace ya pagada por completo, se factura de una vez
          // (misma regla que la ruta de abonos posteriores).
          status: saleStatusForPaid(downPaymentAmount, total, "ACTIVE"),
          paymentMethod,
          origin: "MOSTRADOR",
          ...(saleDate ? { createdAt: saleDate } : {}),
          registradoEn: registroAhora,
          downPaymentAmount,
          grossTotal: new Prisma.Decimal(total),
          discountAmount: new Prisma.Decimal(0),
          paymentReceiptUrl: initialPayment?.receipt?.url ?? "",
          paymentReceiptName: initialPayment?.receipt?.name ?? "",
          paymentReceiptType: initialPayment?.receipt?.type ?? "",
          invoiceToken,
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          ...(initialPayment
            ? {
                salePayments: {
                  create: [
                    {
                      amount: new Prisma.Decimal(initialPayment.amount),
                      paymentMethod: initialPayment.paymentMethod,
                      accountId: initialPayment.accountId,
                      note: initialPayment.note,
                      paymentDate: saleDate ?? null,
                      receiptUrl: initialPayment.receipt?.url ?? null,
                      receiptName: initialPayment.receipt?.name ?? null,
                      receiptType: initialPayment.receipt?.type ?? null,
                      sortOrder: 0,
                      createdById,
                    },
                  ],
                },
              }
            : {}),
        } satisfies Prisma.SaleUncheckedCreateInput,
        select: { id: true, salePayments: { select: { id: true, amount: true } } },
      });
      createdSaleId = createdSale.id;

      if (motivoCheck.motivo && saleDateRaw) {
        // La venta y su abono inicial (que toma la misma fecha) quedan como retroactivos.
        await registrarRetroactivos(tx, [
          {
            tipo: "VENTA",
            registroId: createdSale.id,
            fechaPuesta: saleDateRaw,
            usuarioId: createdById,
            motivo: motivoCheck.motivo,
            monto: total,
          },
          ...createdSale.salePayments.map((payment) => ({
            tipo: "ABONO" as const,
            registroId: payment.id,
            fechaPuesta: saleDateRaw,
            usuarioId: createdById,
            motivo: motivoCheck.motivo as string,
            monto: payment.amount,
          })),
        ]);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
      redirectWithError(returnTo, "El cliente seleccionado no existe");
    }
    console.error("Failed to create direct sale:", error);
    redirectWithError(returnTo, "No se pudo crear la venta");
  }

  await logActivity({
    action: "CREATE",
    entityType: "SALE",
    entityId: createdSaleId,
    summary: createdSaleCode
      ? `Creó la venta directa ${createdSaleCode} por $${Number(total).toLocaleString("es-CO")}`
      : `Creó una venta directa por $${Number(total).toLocaleString("es-CO")}`,
  });

  const comboOk = await comboOrderOkSuffix(createdSaleId, createdById);

  revalidatePath("/admin/ventas");
  if (invoiceToken) {
    revalidatePath(`/sales/${invoiceToken}`);
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: `Venta creada${comboOk}` }).toString()}`);
}

// Edita la fecha de una venta (sale.createdAt, usada en Balances). Opcionalmente
// alinea a esa fecha los cobros de la venta, y si la venta tiene una orden, la
// fecha de la orden, su historial y los cargos/pagos a proveedores, para que
// todo concuerde en la analitica.
export async function adminUpdateSaleDateAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const saleId = typeof formData.get("saleId") === "string" ? (formData.get("saleId") as string).trim() : "";
  const dateRaw = typeof formData.get("date") === "string" ? (formData.get("date") as string).trim() : "";
  const alignAll = formData.get("alignAll") != null;

  if (!saleId) {
    redirect(`${returnTo}?${new URLSearchParams({ error: "Venta invalida" }).toString()}`);
  }

  const parsedDate = new Date(`${dateRaw}T12:00:00`);
  if (!dateRaw || Number.isNaN(parsedDate.getTime())) {
    redirect(`${returnTo}?${new URLSearchParams({ error: "La fecha es invalida" }).toString()}`);
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      createdAt: true,
      total: true,
      order: { select: { id: true } },
      salePayments: { select: { id: true, amount: true, paymentDate: true, createdAt: true } },
    },
  });
  if (!sale) {
    redirect(`${returnTo}?${new URLSearchParams({ error: "Venta no encontrada" }).toString()}`);
  }

  // Retroactivo: la fecha cambia a un dia anterior a hoy. Se registra la venta y, si se alinean,
  // cada abono cuyo dia tambien cambia. Exige motivo.
  const registroAhora = new Date();
  const saleIsRetro = esEdicionRetroactiva(dateRaw, sale.createdAt, registroAhora);
  const retroPayments = alignAll
    ? sale.salePayments.filter((payment) =>
        esEdicionRetroactiva(dateRaw, payment.paymentDate ?? payment.createdAt, registroAhora),
      )
    : [];
  const motivoCheck = exigirMotivoSiRetroactivo(saleIsRetro || retroPayments.length > 0, formData.get(MOTIVO_FIELD));
  if (!motivoCheck.ok) {
    redirect(`${returnTo}?${new URLSearchParams({ error: motivoCheck.error }).toString()}`);
  }
  if (motivoCheck.motivo && !(await usuarioExiste(prisma, userId))) {
    redirect(`${returnTo}?${new URLSearchParams({ error: SESION_VENCIDA }).toString()}`);
  }
  const retroRows: RegistroRetroactivoInput[] = motivoCheck.motivo
    ? [
        ...(saleIsRetro
          ? [
              {
                tipo: "VENTA" as const,
                registroId: sale.id,
                fechaPuesta: dateRaw,
                usuarioId: userId,
                motivo: motivoCheck.motivo,
                monto: sale.total,
              },
            ]
          : []),
        ...retroPayments.map((payment) => ({
          tipo: "ABONO" as const,
          registroId: payment.id,
          fechaPuesta: dateRaw,
          usuarioId: userId,
          motivo: motivoCheck.motivo as string,
          monto: payment.amount,
        })),
      ]
    : [];

  const orderIds = sale.order ? [sale.order.id] : [];

  await prisma.$transaction([
    prisma.sale.update({ where: { id: saleId }, data: { createdAt: parsedDate } }),
    ...(retroRows.length > 0
      ? [prisma.registroRetroactivo.createMany({ data: retroRows.map(datosRegistroRetroactivo) })]
      : []),
    ...(alignAll
      ? [
          // Cobros de la venta.
          prisma.salePayment.updateMany({
            where: { saleId },
            data: { paymentDate: parsedDate },
          }),
          // Orden(es) ligada(s): fecha + fecha de liberacion.
          ...(orderIds.length > 0
            ? [
                prisma.order.updateMany({
                  where: { id: { in: orderIds } },
                  data: { createdAt: parsedDate, releasedAt: parsedDate },
                }),
                prisma.orderStatusHistory.updateMany({
                  where: { orderId: { in: orderIds } },
                  data: { createdAt: parsedDate },
                }),
                // Cargos y pagos a proveedores generados por la(s) orden(es).
                prisma.supplierLedgerEntry.updateMany({
                  where: { orderId: { in: orderIds } },
                  data: { createdAt: parsedDate },
                }),
                prisma.supplierLedgerEntry.updateMany({
                  where: { orderId: { in: orderIds }, paymentDate: { not: null } },
                  data: { paymentDate: parsedDate },
                }),
                // La fecha del producto en el balance de proveedores es su confirmedAt.
                prisma.orderItem.updateMany({
                  where: { orderId: { in: orderIds }, confirmedAt: { not: null } },
                  data: { confirmedAt: parsedDate },
                }),
              ]
            : []),
        ]
      : []),
  ]);

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/balances");
  if (alignAll) {
    revalidatePath("/admin/ordenes");
    revalidatePath("/admin/proveedores");
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Fecha de la venta actualizada" }).toString()}`);
}

// Cambia la forma de pago de una venta (50/50 o contraentrega; no se deja en blanco). No toca abonos.
export async function adminUpdateSalePaymentMethodAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const saleIdValue = formData.get("saleId");
  const saleId = typeof saleIdValue === "string" ? saleIdValue.trim() : "";
  if (!saleId) {
    redirectWithError(returnTo, "Venta invalida");
  }

  const paymentMethod = parsePaymentMethodInput(formData.get("paymentMethod"));
  if (paymentMethod === undefined) {
    redirectWithError(returnTo, "Forma de pago invalida");
  }
  if (paymentMethod === null) {
    redirectWithError(returnTo, MISSING_PAYMENT_METHOD_MESSAGE);
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, code: true, invoiceToken: true, order: { select: { id: true } } },
  });
  if (!sale) {
    redirectWithError(returnTo, "Venta no encontrada");
  }

  await prisma.sale.update({ where: { id: sale.id }, data: { paymentMethod } });

  await logActivity({
    action: "UPDATE",
    entityType: "SALE",
    entityId: sale.id,
    summary: `Cambió la forma de pago de la venta ${sale.code} a ${PAYMENT_METHOD_SHORT_LABEL[paymentMethod]}`,
  });

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/despachos/transportadora");
  if (sale.order) {
    revalidatePath(`/admin/ordenes/${sale.order.id}`);
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Forma de pago actualizada" }).toString()}`);
}