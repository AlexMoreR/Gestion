"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createClientSchema = z.object({
  name: z.string().trim().min(2, "Nombre invalido").max(120, "Nombre demasiado largo"),
  email: z.string().trim().email("Correo invalido"),
});

const quoteItemSchema = z.object({
  productId: z.string().trim().min(1, "Producto invalido"),
  supplierId: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().int().min(1, "Cantidad invalida").max(10000),
  unitPrice: z.coerce.number().positive("Precio invalido"),
});

const createQuoteSchema = z.object({
  clientId: z.string().trim().min(1, "Cliente invalido"),
  notes: z.string().trim().max(2000, "Notas demasiado largas").optional(),
  validUntil: z.string().trim().optional(),
  items: z.array(quoteItemSchema).min(1, "Debes agregar al menos un producto"),
});

const updateQuoteMetaSchema = z.object({
  quoteId: z.string().trim().min(1, "Cotizacion invalida"),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  notes: z.string().trim().max(2000, "Notas demasiado largas").optional(),
  validUntil: z.string().trim().optional(),
});

async function requireAdminSession() {
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

function buildQuoteCode(index: number): string {
  return `COT-${String(index).padStart(5, "0")}`;
}

export async function adminCreateClientQuickAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+cliente+invalidos`);
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    if (existing.role !== "CLIENTE") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "CLIENTE" },
      });
      revalidatePath(returnTo);
      redirect(`${returnTo}?ok=Cliente+actualizado`);
    }

    redirect(`${returnTo}?ok=Cliente+ya+existia`);
  }

  const password = randomUUID().replace(/-/g, "").slice(0, 14);
  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: Role.CLIENTE,
      password: hashedPassword,
    },
  });

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cliente+creado`);
}

export async function adminCreateQuoteAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const rawItems = formData.get("items");
  let parsedItems: unknown[] = [];
  if (typeof rawItems === "string" && rawItems.trim()) {
    try {
      parsedItems = JSON.parse(rawItems) as unknown[];
    } catch {
      redirect(`${returnTo}?error=Productos+de+cotizacion+invalidos`);
    }
  }

  const parsed = createQuoteSchema.safeParse({
    clientId: formData.get("clientId"),
    notes: formData.get("notes") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    items: parsedItems,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+cotizacion+invalidos`);
  }

  const validUntilDate =
    parsed.data.validUntil && parsed.data.validUntil.length > 0 ? new Date(parsed.data.validUntil) : null;

  if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+validez+invalida`);
  }

  const productIds = Array.from(new Set(parsed.data.items.map((item) => item.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      suppliers: {
        include: { supplier: true },
      },
    },
  });

  if (products.length !== productIds.length) {
    redirect(`${returnTo}?error=Uno+o+mas+productos+no+existen`);
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  const normalizedItems = parsed.data.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error("Producto invalido");
    }

    const supplierId = item.supplierId?.trim() ? item.supplierId.trim() : null;
    if (supplierId) {
      const allowed = product.suppliers.some((relation) => relation.supplierId === supplierId);
      if (!allowed) {
        throw new Error("Proveedor invalido para producto");
      }
    }

    const lineTotal = Number((item.quantity * item.unitPrice).toFixed(2));

    return {
      productId: item.productId,
      supplierId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal,
    };
  });

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const total = subtotal;

  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.quote.count();
      const code = buildQuoteCode(count + 1);
      const shareToken = randomUUID().replace(/-/g, "");

      await tx.quote.create({
        data: {
          code,
          clientId: parsed.data.clientId,
          createdById,
          notes: parsed.data.notes || null,
          validUntil: validUntilDate,
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          shareToken,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              supplierId: item.supplierId,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              lineTotal: new Prisma.Decimal(item.lineTotal),
            })),
          },
        },
      });
    });
  } catch {
    redirect(`${returnTo}?error=No+se+pudo+crear+la+cotizacion`);
  }

  revalidatePath(returnTo);
  revalidatePath("/admin/cotizaciones");
  redirect(`${returnTo}?ok=Cotizacion+creada`);
}

export async function adminUpdateQuoteMetaAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = updateQuoteMetaSchema.safeParse({
    quoteId: formData.get("quoteId"),
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
    validUntil: formData.get("validUntil") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+cotizacion+invalidos`);
  }

  const validUntilDate =
    parsed.data.validUntil && parsed.data.validUntil.length > 0 ? new Date(parsed.data.validUntil) : null;

  if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+validez+invalida`);
  }

  await prisma.quote.update({
    where: { id: parsed.data.quoteId },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      validUntil: validUntilDate,
    },
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+actualizada`);
}

export async function adminDeleteQuoteAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const quoteId = String(formData.get("quoteId") || "").trim();

  if (!quoteId) {
    redirect(`${returnTo}?error=Cotizacion+invalida`);
  }

  await prisma.quote.delete({
    where: { id: quoteId },
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+eliminada`);
}
