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
import { logActivity } from "@/lib/activity-log";
import { calculateQuoteLineTotal, stringifyQuoteItemMeta } from "@/lib/quote-item-meta";
import { prisma } from "@/lib/prisma";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const createClientSchema = z.object({
  name: z.string().trim().min(2, "Nombre invalido").max(120, "Nombre demasiado largo"),
  document: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(40, "Documento demasiado largo").optional(),
  ),
  email: z.preprocess(
    emptyToUndefined,
    z.string().trim().email("Correo invalido").max(180, "Correo demasiado largo").optional(),
  ),
  phone: z.string().trim().min(7, "Telefono invalido").max(30, "Telefono demasiado largo"),
  address: z.string().trim().min(5, "Direccion invalida").max(180, "Direccion demasiado larga"),
  neighborhood: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120, "Barrio demasiado largo").optional(),
  ),
  department: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120, "Departamento demasiado largo").optional(),
  ),
  city: z.string().trim().min(2, "Ciudad invalida").max(120, "Ciudad demasiado larga"),
});

// Tope superior razonable para montos (mil millones) — evita Infinity/Decimal roto
// ante un payload manipulado.
const MAX_MONEY = 1_000_000_000;

const quoteItemSchema = z.object({
  productId: z.string().trim().min(1, "Producto invalido"),
  supplierId: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().int().min(1, "Cantidad invalida").max(10000),
  // Un componente de combo puede valer 0 (reparto/precio 0); el wizard exige
  // precio > 0 para productos sueltos, asi que aqui basta con >= 0.
  unitPrice: z.coerce.number().min(0, "Precio invalido").max(MAX_MONEY, "Precio fuera de rango"),
  // "por stock" (STOCK) o "por orden" (MANUFACTURE), elegido por linea de venta.
  fulfillmentMode: z.enum(["STOCK", "MANUFACTURE"]).optional().default("STOCK"),
  color: z.string().trim().max(120, "Color demasiado largo").optional().nullable(),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional().nullable(),
  additionalCost: z.coerce.number().min(0, "Costo adicional invalido").max(MAX_MONEY, "Costo adicional fuera de rango").optional().default(0),
  discount: z.coerce.number().min(0, "Descuento invalido").max(MAX_MONEY, "Descuento fuera de rango").optional().default(0),
  // Imagen personalizada subida para esta linea (ruta local /uploads/...).
  imageUrl: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(500, "Ruta de imagen demasiado larga").optional().nullable(),
  ),
  // Agrupacion de combo (las lineas con el mismo comboKey se muestran como una sola fila).
  comboKey: z.string().trim().max(120).optional().nullable(),
  comboName: z.string().trim().max(200).optional().nullable(),
  comboCode: z.string().trim().max(120).optional().nullable(),
  comboQuantity: z.coerce.number().int().min(0).optional().default(0),
});

const QUOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function adminUploadQuoteImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdminSession();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No se recibio ninguna imagen" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten archivos de imagen" };
  }
  if (file.size <= 0) {
    return { ok: false, error: "Archivo de imagen vacio" };
  }
  if (file.size > QUOTE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "La imagen debe pesar maximo 5MB" };
  }

  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "quotes");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name)?.toLowerCase() || ".jpg";
    const safeExt = ext.length <= 8 ? ext : ".jpg";
    const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;
    await writeFile(path.join(uploadDir, fileName), buffer);

    return { ok: true, url: `/uploads/quotes/${fileName}` };
  } catch {
    return { ok: false, error: "No se pudo guardar la imagen" };
  }
}

const createQuoteSchema = z.object({
  clientId: z.string().trim().optional(),
  notes: z.string().trim().max(2000, "Notas demasiado largas").optional(),
  validUntil: z.string().trim().optional(),
  createdAt: z.string().trim().optional(),
  items: z.array(quoteItemSchema).min(1, "Debes agregar al menos un producto"),
});

const updateQuoteMetaSchema = z.object({
  quoteId: z.string().trim().min(1, "Cotizacion invalida"),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  notes: z.string().trim().max(2000, "Notas demasiado largas").optional(),
  validUntil: z.string().trim().optional(),
});

const updateQuoteFullSchema = z.object({
  quoteId: z.string().trim().min(1, "Cotizacion invalida"),
  clientId: z.string().trim().optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
  notes: z.string().trim().max(2000, "Notas demasiado largas").optional(),
  validUntil: z.string().trim().optional(),
  createdAt: z.string().trim().optional(),
  items: z.array(quoteItemSchema).min(1, "Debes agregar al menos un producto"),
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

function isQuoteCodeUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function parseQuoteCodeNumber(code: string): number {
  const match = /^COT-(\d+)$/.exec(code.trim());
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

async function upsertClientFromData(data: z.infer<typeof createClientSchema>): Promise<string> {
  const clientProfileData = {
    name: data.name,
    document: data.document ?? null,
    phone: data.phone,
    address: data.address,
    neighborhood: data.neighborhood ?? null,
    department: data.department ?? null,
    city: data.city,
  };

  // Se reutiliza un cliente existente para no duplicarlo: primero por correo
  // (clave unica), luego por documento (identidad fuerte) y, si no hay
  // documento, por telefono. Asi un cliente "sin correo" no se vuelve a crear.
  let existing = data.email
    ? await prisma.user.findUnique({ where: { email: data.email } })
    : null;

  if (!existing && data.document) {
    existing = await prisma.user.findFirst({
      where: { role: "CLIENTE", document: data.document },
    });
  }

  if (!existing && !data.document && data.phone) {
    existing = await prisma.user.findFirst({
      where: { role: "CLIENTE", phone: data.phone },
    });
  }

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "CLIENTE",
        ...clientProfileData,
      },
      select: { id: true },
    });
    return updated.id;
  }

  const password = randomUUID().replace(/-/g, "").slice(0, 14);
  const hashedPassword = await bcrypt.hash(password, 12);
  const email = data.email ?? `cliente-${randomUUID().replace(/-/g, "").slice(0, 16)}@sin-correo.local`;
  const created = await prisma.user.create({
    data: {
      ...clientProfileData,
      email,
      role: Role.CLIENTE,
      password: hashedPassword,
    },
    select: { id: true },
  });
  return created.id;
}

export async function adminCreateClientQuickAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    document: formData.get("document"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    neighborhood: formData.get("neighborhood"),
    department: formData.get("department"),
    city: formData.get("city"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos de cliente invalidos";
    redirect(`${returnTo}?${new URLSearchParams({ error: message }).toString()}`);
  }

  await upsertClientFromData(parsed.data);

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cliente+guardado`);
}

export async function adminResolveClientAction(
  input: z.infer<typeof createClientSchema>,
): Promise<{ ok: true; clientId: string } | { ok: false; error: string }> {
  await requireAdminSession();
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    // Mensaje especifico del campo que falla (ej. "Correo invalido"), para que
    // la persona sepa exactamente que corregir en vez de un error generico.
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos de cliente invalidos" };
  }

  try {
    const clientId = await upsertClientFromData(parsed.data);
    return { ok: true, clientId };
  } catch {
    return { ok: false, error: "No se pudo guardar el cliente" };
  }
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
    createdAt: formData.get("createdAt") || undefined,
    items: parsedItems,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+cotizacion+invalidos`);
  }

  let resolvedClientId = "";

  const incomingClientId = parsed.data.clientId?.trim() ?? "";
  if (incomingClientId) {
    const existingClient = await prisma.user.findFirst({
      where: { id: incomingClientId, role: "CLIENTE" },
      select: { id: true },
    });

    if (!existingClient) {
      redirect(`${returnTo}?error=Cliente+invalido`);
    }
    resolvedClientId = existingClient.id;
  } else {
    const parsedClient = createClientSchema.safeParse({
      name: formData.get("name"),
      document: formData.get("document"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      neighborhood: formData.get("neighborhood"),
      department: formData.get("department"),
      city: formData.get("city"),
    });

    if (!parsedClient.success) {
      redirect(`${returnTo}?error=Datos+de+cliente+invalidos`);
    }
    resolvedClientId = await upsertClientFromData(parsedClient.data);
  }

  const validUntilDate =
    parsed.data.validUntil && parsed.data.validUntil.length > 0 ? new Date(parsed.data.validUntil) : null;

  if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+validez+invalida`);
  }

  const createdAtDate =
    parsed.data.createdAt && parsed.data.createdAt.length > 0 ? new Date(parsed.data.createdAt) : null;

  if (createdAtDate && Number.isNaN(createdAtDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+cotizacion+invalida`);
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

    const lineTotal = calculateQuoteLineTotal(
      item.quantity,
      item.unitPrice,
      item.additionalCost ?? 0,
      item.discount ?? 0,
    );
    const notes = stringifyQuoteItemMeta({
      color: item.color ?? "",
      description: item.notes ?? "",
      additionalCost: item.additionalCost ?? 0,
      discount: item.discount ?? 0,
      imageUrl: item.imageUrl ?? "",
      comboKey: item.comboKey ?? "",
      comboName: item.comboName ?? "",
      comboCode: item.comboCode ?? "",
      comboQuantity: item.comboQuantity ?? 0,
    });

    return {
      productId: item.productId,
      supplierId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      fulfillmentMode: item.fulfillmentMode,
      lineTotal,
      notes,
    };
  });

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const total = subtotal;

  let createdQuoteCode: string | null = null;
  let createdQuoteId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const lastQuote = await tx.quote.findFirst({
        select: { code: true },
        orderBy: { code: "desc" },
      });
      const baseCodeNumber = lastQuote ? parseQuoteCodeNumber(lastQuote.code) : 0;
      const maxCodeAttempts = 30;

      for (let offset = 0; offset < maxCodeAttempts; offset += 1) {
        const code = buildQuoteCode(baseCodeNumber + 1 + offset);
        const shareToken = randomUUID().replace(/-/g, "");

        try {
          const createdQuote = await tx.quote.create({
            data: {
              code,
              clientId: resolvedClientId,
              createdById,
              notes: parsed.data.notes || null,
              validUntil: validUntilDate,
              ...(createdAtDate ? { createdAt: createdAtDate } : {}),
              subtotal: new Prisma.Decimal(subtotal),
              total: new Prisma.Decimal(total),
              shareToken,
              items: {
                create: normalizedItems.map((item) => ({
                  productId: item.productId,
                  supplierId: item.supplierId,
                  quantity: item.quantity,
                  unitPrice: new Prisma.Decimal(item.unitPrice),
                  fulfillmentMode: item.fulfillmentMode,
                  lineTotal: new Prisma.Decimal(item.lineTotal),
                  notes: item.notes,
                })),
              },
            },
            select: { id: true, code: true },
          });
          createdQuoteCode = createdQuote.code;
          createdQuoteId = createdQuote.id;
          return;
        } catch (error) {
          if (isQuoteCodeUniqueError(error) && offset < maxCodeAttempts - 1) {
            continue;
          }
          throw error;
        }
      }
    });
  } catch {
    redirect(`${returnTo}?error=No+se+pudo+crear+la+cotizacion`);
  }

  await logActivity({
    action: "CREATE",
    entityType: "QUOTE",
    entityId: createdQuoteId,
    summary: createdQuoteCode ? `Creó la cotización ${createdQuoteCode}` : "Creó una cotización",
  });

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

  const updatedQuote = await prisma.quote.update({
    where: { id: parsed.data.quoteId },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      validUntil: validUntilDate,
    },
    select: { code: true },
  });

  await logActivity({
    action: "UPDATE",
    entityType: "QUOTE",
    entityId: parsed.data.quoteId,
    summary: `Actualizó la cotización ${updatedQuote.code}`,
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+actualizada`);
}

export async function adminUpdateQuoteFullAction(formData: FormData): Promise<void> {
  await requireAdminSession();
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

  const parsed = updateQuoteFullSchema.safeParse({
    quoteId: formData.get("quoteId"),
    clientId: formData.get("clientId"),
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
    validUntil: formData.get("validUntil") || undefined,
    createdAt: formData.get("createdAt") || undefined,
    items: parsedItems,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+cotizacion+invalidos`);
  }

  let resolvedClientId = "";
  const incomingClientId = parsed.data.clientId?.trim() ?? "";

  if (incomingClientId) {
    const existingClient = await prisma.user.findFirst({
      where: { id: incomingClientId, role: "CLIENTE" },
      select: { id: true },
    });

    if (!existingClient) {
      redirect(`${returnTo}?error=Cliente+invalido`);
    }
    resolvedClientId = existingClient.id;
  } else {
    const parsedClient = createClientSchema.safeParse({
      name: formData.get("name"),
      document: formData.get("document"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      neighborhood: formData.get("neighborhood"),
      department: formData.get("department"),
      city: formData.get("city"),
    });

    if (!parsedClient.success) {
      redirect(`${returnTo}?error=Datos+de+cliente+invalidos`);
    }
    resolvedClientId = await upsertClientFromData(parsedClient.data);
  }

  const validUntilDate =
    parsed.data.validUntil && parsed.data.validUntil.length > 0 ? new Date(parsed.data.validUntil) : null;

  if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+validez+invalida`);
  }

  const createdAtDate =
    parsed.data.createdAt && parsed.data.createdAt.length > 0 ? new Date(parsed.data.createdAt) : null;

  if (createdAtDate && Number.isNaN(createdAtDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+cotizacion+invalida`);
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
    const lineTotal = calculateQuoteLineTotal(
      item.quantity,
      item.unitPrice,
      item.additionalCost ?? 0,
      item.discount ?? 0,
    );
    const notes = stringifyQuoteItemMeta({
      color: item.color ?? "",
      description: item.notes ?? "",
      additionalCost: item.additionalCost ?? 0,
      discount: item.discount ?? 0,
      imageUrl: item.imageUrl ?? "",
      comboKey: item.comboKey ?? "",
      comboName: item.comboName ?? "",
      comboCode: item.comboCode ?? "",
      comboQuantity: item.comboQuantity ?? 0,
    });
    return {
      productId: item.productId,
      supplierId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      fulfillmentMode: item.fulfillmentMode,
      lineTotal,
      notes,
    };
  });

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const total = subtotal;

  const updatedQuote = await prisma.quote.update({
    where: { id: parsed.data.quoteId },
    data: {
      clientId: resolvedClientId,
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      validUntil: validUntilDate,
      ...(createdAtDate ? { createdAt: createdAtDate } : {}),
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(total),
      items: {
        deleteMany: {},
        create: normalizedItems.map((item) => ({
          productId: item.productId,
          supplierId: item.supplierId,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          fulfillmentMode: item.fulfillmentMode,
          lineTotal: new Prisma.Decimal(item.lineTotal),
          notes: item.notes,
        })),
      },
    },
    select: { code: true },
  });

  await logActivity({
    action: "UPDATE",
    entityType: "QUOTE",
    entityId: parsed.data.quoteId,
    summary: `Actualizó la cotización ${updatedQuote.code}`,
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`/admin/cotizaciones?ok=Cotizacion+actualizada`);
}

export async function adminDeleteQuoteAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const quoteId = String(formData.get("quoteId") || "").trim();

  if (!quoteId) {
    redirect(`${returnTo}?error=Cotizacion+invalida`);
  }

  const sale = await prisma.sale.findUnique({
    where: { quoteId },
    select: { code: true },
  });

  if (sale) {
    redirect(
      `${returnTo}?error=No+se+puede+eliminar:+la+cotizacion+ya+tiene+una+venta+asociada+(${encodeURIComponent(
        sale.code
      )})`
    );
  }

  const quoteToDelete = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { code: true },
  });

  await prisma.quote.delete({
    where: { id: quoteId },
  });

  await logActivity({
    action: "DELETE",
    entityType: "QUOTE",
    entityId: quoteId,
    summary: quoteToDelete
      ? `Eliminó la cotización ${quoteToDelete.code}`
      : `Eliminó la cotización ${quoteId}`,
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+eliminada`);
}
