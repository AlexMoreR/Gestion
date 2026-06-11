"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createSaleSchema = z.object({
  quoteId: z.string().trim().min(1, "Quote is invalid"),
});

const PAYMENT_RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

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

async function savePaymentReceipt(file: File, saleCode: string): Promise<{ url: string; name: string; type: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("Invalid payment receipt file");
  }

  if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    throw new Error("Payment receipt is too large");
  }

  const allowedType =
    file.type.startsWith("image/") ||
    file.type === "application/pdf";

  if (!allowedType) {
    throw new Error("Unsupported payment receipt format");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "sales", "receipts");
  await mkdir(uploadDir, { recursive: true });

  const extensionFromType =
    file.type === "application/pdf"
      ? ".pdf"
      : path.extname(file.name).toLowerCase() || ".png";

  const safeExtension = extensionFromType.length <= 8 ? extensionFromType : ".png";
  const fileName = `${saleCode.toLowerCase()}-${Date.now()}-${randomUUID()}${safeExtension}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/sales/receipts/${fileName}`,
    name: file.name.trim() || fileName,
    type: file.type || "application/octet-stream",
  };
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
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Invalid+quote`);
  }

  const receipt = formData.get("paymentReceipt");
  if (!(receipt instanceof File) || receipt.size <= 0) {
    redirect(`${returnTo}?error=Payment+receipt+is+required`);
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
    redirect(`${returnTo}?error=Quote+not+found`);
  }

  if (quote.sale) {
    redirect(`${returnTo}?error=This+quote+has+already+been+sent+to+sales`);
  }

  const savedReceipt = await savePaymentReceipt(receipt, quote.code);

  try {
    await prisma.$transaction(async (tx) => {
      const saleCode = await getNextSaleCode(tx);
      invoiceToken = randomUUID().replace(/-/g, "");

      await tx.sale.create({
        data: {
          code: saleCode,
          quoteId: quote.id,
          clientId: quote.clientId,
          createdById,
          status: "ACTIVE",
          paymentReceiptUrl: savedReceipt.url,
          paymentReceiptName: savedReceipt.name,
          paymentReceiptType: savedReceipt.type,
          invoiceToken,
          subtotal: quote.subtotal,
          total: quote.total,
        },
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: "ACCEPTED" },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`${returnTo}?error=This+quote+has+already+been+sent+to+sales`);
    }

    console.error("Failed to create sale:", error);
    redirect(`${returnTo}?error=Could+not+create+sales+record`);
  }

  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  if (invoiceToken) {
    revalidatePath(`/sales/${invoiceToken}`);
  }
  redirect(`${returnTo}?ok=Sale+created`);
}
