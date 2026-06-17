"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { calculateQuoteLineTotal, stringifyQuoteItemMeta } from "@/lib/quote-item-meta";
import { prisma } from "@/lib/prisma";

type PaymentMethod = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO";

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
const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]);

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
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

function parsePaymentMethod(rawValue: FormDataEntryValue | null): PaymentMethod | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const value = rawValue.trim().toUpperCase() as PaymentMethod;
  return ALLOWED_PAYMENT_METHODS.has(value) ? value : null;
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
  paymentMethod: PaymentMethod;
  note: string | null;
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

  const quote = await prisma.quote.findUnique({
    where: { id: parsed.data.quoteId },
    include: {
      client: true,
      items: true,
      sale: true,
    },
  });

  if (!quote) {
    redirectWithError(returnTo, "No se encontro la cotizacion");
  }

  if (quote.sale) {
    redirectWithError(returnTo, "Esta cotizacion ya fue enviada a ventas");
  }

  const grossTotal = Number(quote.total);
  const discountAmount = parsed.data.discountAmount ?? 0;
  if (discountAmount >= grossTotal) {
    redirectWithError(returnTo, "El descuento debe ser menor al total de la cotizacion");
  }

  const netTotal = Math.max(grossTotal - discountAmount, 0);
  const amountEntries = formData.getAll("paymentReceiptAmounts");
  const receiptEntries = formData.getAll("paymentReceipts");
  const receiptMethodEntries = formData.getAll("paymentReceiptMethods");
  const receiptNoteEntries = formData.getAll("paymentReceiptNotes");

  if (amountEntries.length === 0) {
    redirectWithError(returnTo, "Debes registrar al menos un abono");
  }

  if (
    amountEntries.length !== receiptMethodEntries.length ||
    amountEntries.length !== receiptNoteEntries.length ||
    amountEntries.length !== receiptEntries.length
  ) {
    redirectWithError(returnTo, "Faltan datos de uno o mas abonos");
  }

  const installments = amountEntries.map((amountEntry, index) => {
    const amount = typeof amountEntry === "string" ? Number(amountEntry) : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      redirectWithError(returnTo, "Cada abono necesita un monto valido");
    }

    const paymentMethod = parsePaymentMethod(receiptMethodEntries[index]);
    if (!paymentMethod) {
      redirectWithError(returnTo, "Cada abono necesita un medio de pago");
    }

    const noteValue = receiptNoteEntries[index];
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    const fileEntry = receiptEntries[index];
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (paymentMethod !== "EFECTIVO" && !file) {
      redirectWithError(returnTo, "Los abonos que no sean en efectivo deben incluir comprobante");
    }

    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        redirectWithError(returnTo, validationError);
      }
    }

    return {
      amount,
      paymentMethod,
      note: note || null,
      file,
    };
  });

  const totalDownPayment = installments.reduce((sum, installment) => sum + installment.amount, 0);
  if (totalDownPayment <= 0) {
    redirectWithError(returnTo, "Debes registrar al menos un abono valido");
  }

  if (totalDownPayment > netTotal) {
    redirectWithError(returnTo, "La suma de los abonos no puede superar el total real de la venta");
  }

  const savedReceipts = await Promise.all(
    installments.map(async ({ amount, paymentMethod, note, file }, index) => {
      if (!file) {
        return {
          amount,
          paymentMethod,
          note,
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
        note,
        receiptUrl: savedReceipt.url,
        receiptName: savedReceipt.name,
        receiptType: savedReceipt.type,
        size: file.size,
      } satisfies SalePaymentReceipt;
    }),
  );

  try {
    await prisma.$transaction(async (tx) => {
      const saleCode = await getNextSaleCode(tx);
      invoiceToken = randomUUID().replace(/-/g, "");
      const primaryReceipt = savedReceipts.find((receipt) => Boolean(receipt.receiptUrl)) ?? savedReceipts[0];

      await tx.sale.create({
        data: {
          code: saleCode,
          quoteId: quote.id,
          clientId: quote.clientId,
          createdById,
          status: "ACTIVE",
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
              note: receipt.note,
              receiptUrl: receipt.receiptUrl,
              receiptName: receipt.receiptName,
              receiptType: receipt.receiptType,
              sortOrder: index,
            })),
          },
          paymentReceipts: savedReceipts,
          invoiceToken,
          subtotal: quote.subtotal,
          total: netTotal,
        } satisfies Prisma.SaleUncheckedCreateInput,
      });

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

  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  if (invoiceToken) {
    revalidatePath(`/sales/${invoiceToken}`);
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Venta creada" }).toString()}`);
}

const addSalePaymentSchema = z.object({
  saleId: z.string().trim().min(1, "Venta invalida"),
  amount: z.coerce.number().positive("El monto del abono debe ser mayor a cero"),
});

export async function adminAddSalePaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = addSalePaymentSchema.safeParse({
    saleId: formData.get("saleId"),
    amount: formData.get("amount"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos del abono invalidos");
  }

  const paymentMethod = parsePaymentMethod(formData.get("paymentMethod"));
  if (!paymentMethod) {
    redirectWithError(returnTo, "Selecciona un medio de pago valido");
  }

  const noteValue = formData.get("note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  const fileEntry = formData.get("receipt");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  if (paymentMethod !== "EFECTIVO" && !file) {
    redirectWithError(returnTo, "Los abonos que no sean en efectivo deben incluir comprobante");
  }

  if (file) {
    const validationError = validateReceiptFile(file);
    if (validationError) {
      redirectWithError(returnTo, validationError);
    }
  }

  const sale = await prisma.sale.findUnique({
    where: { id: parsed.data.saleId },
    include: { salePayments: true },
  });

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
      payment.paymentMethod === paymentMethod &&
      payment.createdAt instanceof Date &&
      now - payment.createdAt.getTime() < DUPLICATE_WINDOW_MS,
  );
  if (hasRecentDuplicate) {
    redirect(`${returnTo}?${new URLSearchParams({ ok: "Abono registrado" }).toString()}`);
  }

  const nextSortOrder = sale.salePayments.reduce((max, payment) => Math.max(max, payment.sortOrder + 1), sale.salePayments.length);

  let savedReceipt: { url: string; name: string; type: string } | null = null;
  if (file) {
    savedReceipt = await savePaymentReceipt(file, sale.code, nextSortOrder);
  }

  const newTotalPaid = alreadyPaid + parsed.data.amount;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount: parsed.data.amount,
          paymentMethod,
          note: note || null,
          receiptUrl: savedReceipt?.url ?? null,
          receiptName: savedReceipt?.name ?? null,
          receiptType: savedReceipt?.type ?? null,
          sortOrder: nextSortOrder,
        },
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          downPaymentAmount: newTotalPaid,
          status: newTotalPaid >= capital && sale.status === "ACTIVE" ? "INVOICED" : sale.status,
        },
      });
    });
  } catch (error) {
    console.error("Failed to add sale payment:", error);
    redirectWithError(returnTo, "No se pudo registrar el abono");
  }

  revalidatePath("/admin/ventas");
  revalidatePath(`/sales/${sale.invoiceToken}`);
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Abono registrado" }).toString()}`);
}

const deleteSalePaymentSchema = z.object({
  paymentId: z.string().trim().min(1, "Abono invalido"),
});

export async function adminDeleteSalePaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = deleteSalePaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Abono invalido");
  }

  const payment = await prisma.salePayment.findUnique({
    where: { id: parsed.data.paymentId },
    include: { sale: { include: { salePayments: true } } },
  });

  if (!payment) {
    redirectWithError(returnTo, "No se encontro el abono");
  }

  const sale = payment.sale;
  const capital = Number(sale.total);
  const newTotalPaid = sale.salePayments
    .filter((item) => item.id !== payment.id)
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.salePayment.delete({ where: { id: payment.id } });

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          downPaymentAmount: newTotalPaid,
          // Si la venta estaba marcada como facturada por estar pagada y ahora
          // queda saldo pendiente, se regresa a activa.
          status: sale.status === "INVOICED" && newTotalPaid < capital ? "ACTIVE" : sale.status,
        },
      });
    });
  } catch (error) {
    console.error("Failed to delete sale payment:", error);
    redirectWithError(returnTo, "No se pudo eliminar el abono");
  }

  revalidatePath("/admin/ventas");
  revalidatePath(`/sales/${sale.invoiceToken}`);
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Abono eliminado" }).toString()}`);
}

// ─── VENTA DIRECTA (mostrador, sin cotizacion previa) ──────────────────────

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

  const clientNameRaw = formData.get("clientName");
  const clientName = typeof clientNameRaw === "string" && clientNameRaw.trim()
    ? clientNameRaw.trim()
    : "Consumidor final";

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
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    redirectWithError(returnTo, "Uno o mas productos no existen");
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

  // Abono inicial opcional
  const amountRaw = formData.get("amount");
  const hasInitialPayment = typeof amountRaw === "string" && amountRaw.trim() !== "" && Number(amountRaw) > 0;

  let initialPayment: { amount: number; paymentMethod: PaymentMethod; note: string | null; receipt: { url: string; name: string; type: string } | null } | null = null;

  if (hasInitialPayment) {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      redirectWithError(returnTo, "El monto del abono debe ser mayor a cero");
    }
    if (amount > total + 0.0001) {
      redirectWithError(returnTo, "El abono no puede superar el total de la venta");
    }

    const paymentMethod = parsePaymentMethod(formData.get("paymentMethod"));
    if (!paymentMethod) {
      redirectWithError(returnTo, "Selecciona un medio de pago valido");
    }

    const noteValue = formData.get("note");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";

    const fileEntry = formData.get("receipt");
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (paymentMethod !== "EFECTIVO" && !file) {
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

    initialPayment = { amount, paymentMethod, note: note || null, receipt: savedReceipt };
  }

  const downPaymentAmount = initialPayment?.amount ?? 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Cliente de mostrador (se crea uno por venta para conservar el nombre)
      const placeholderEmail = `mostrador-${randomUUID().replace(/-/g, "").slice(0, 18)}@magilus.local`;
      const hashedPassword = await bcrypt.hash(randomUUID().replace(/-/g, "").slice(0, 14), 12);
      const client = await tx.user.create({
        data: {
          name: clientName,
          email: placeholderEmail,
          role: Role.CLIENTE,
          password: hashedPassword,
        },
        select: { id: true },
      });

      // Cotizacion interna (para mantener la estructura factura -> cotizacion)
      const quoteCode = await getNextQuoteCode(tx);
      const shareToken = randomUUID().replace(/-/g, "");
      const quote = await tx.quote.create({
        data: {
          code: quoteCode,
          clientId: client.id,
          createdById,
          status: "ACCEPTED",
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
      invoiceToken = randomUUID().replace(/-/g, "");

      await tx.sale.create({
        data: {
          code: saleCode,
          quoteId: quote.id,
          clientId: client.id,
          createdById,
          status: "ACTIVE",
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
                      note: initialPayment.note,
                      receiptUrl: initialPayment.receipt?.url ?? null,
                      receiptName: initialPayment.receipt?.name ?? null,
                      receiptType: initialPayment.receipt?.type ?? null,
                      sortOrder: 0,
                    },
                  ],
                },
              }
            : {}),
        } satisfies Prisma.SaleUncheckedCreateInput,
      });
    });
  } catch (error) {
    console.error("Failed to create direct sale:", error);
    redirectWithError(returnTo, "No se pudo crear la venta");
  }

  revalidatePath("/admin/ventas");
  if (invoiceToken) {
    revalidatePath(`/sales/${invoiceToken}`);
  }
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Venta creada" }).toString()}`);
}
