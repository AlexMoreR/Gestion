"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { COTIZACION_CON_VENTA_LINEAS, errorAlGuardarLineas, lineasAgregadas, mismasLineas } from "@/lib/quote-lines";
import { agregarLineasAVenta } from "@/lib/sale-add-lines.server";
import { partesPorProducto } from "@/lib/product-parts.server";
import { displayCode } from "@/lib/code-display";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { getActivityActor, logActivity, logActivityTx } from "@/lib/activity-log";
import { fullCopyForLog } from "@/lib/activity-log-snapshot";
import { calculateQuoteLineTotal, stringifyQuoteItemMeta } from "@/lib/quote-item-meta";
import { imagenDeColores, imagenesDeLineas } from "@/lib/vista-color.server";
import { prisma } from "@/lib/prisma";
import { createQuoteWithNextCode, upsertQuoteClient } from "@/lib/quote-creation";
import type { CartaColores } from "@/lib/carta-colores-crm";
import { leerCartaColores } from "@/lib/carta-colores-crm.server";

// Foto de la cotización para la bitácora (antes/después). Sin la imagen de los ítems.
async function quoteForLog(db: Prisma.TransactionClient, quoteId: string) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      code: true,
      status: true,
      clientId: true,
      notes: true,
      validUntil: true,
      subtotal: true,
      total: true,
      origin: true,
      createdById: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          supplierId: true,
          quantity: true,
          unitPrice: true,
          fulfillmentMode: true,
          lineTotal: true,
          notes: true,
        },
      },
    },
  });
  return quote ? fullCopyForLog(quote) : null;
}

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

// Color por parte (nov-2026): textos cortos, foto solo como enlace web, hex #RRGGBB. color "" = Por definir.
const parteElegidaSchema = z.object({
  parte: z.string().trim().min(1, "Parte sin nombre").max(40, "Nombre de parte demasiado largo"),
  color: z.string().trim().max(80, "Color de parte demasiado largo").optional().default(""),
  colorCodigo: z.string().trim().max(40).optional().default(""),
  colorMaterial: z.string().trim().max(80).optional().default(""),
  colorFotoUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Foto de color invalida")
    .optional()
    .default(""),
  hex: z
    .string()
    .trim()
    .refine((v) => !v || /^#[0-9a-fA-F]{6}$/.test(v), "Color hex invalido")
    .optional()
    .default(""),
});

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
  // Color de la carta del CRM (copia en texto). La foto solo como enlace http(s).
  colorCodigo: z.string().trim().max(40).optional().nullable(),
  colorMaterial: z.string().trim().max(80).optional().nullable(),
  colorFotoUrl: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(1000).regex(/^https?:\/\//i, "Foto de color invalida").optional().nullable(),
  ),
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
  partes: z.array(parteElegidaSchema).max(10, "Maximo 10 partes de color").optional().default([]),
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
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["quotes"]))) {
    redirect("/unauthorized");
  }
  return session.user.id;
}

// Un empleado solo puede modificar o borrar las cotizaciones que él creó; el
// dueño (ADMIN) puede con todas.
async function assertQuoteOwnership(quoteId: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role === "ADMIN") {
    return;
  }
  const quote = quoteId
    ? await prisma.quote.findUnique({ where: { id: quoteId }, select: { createdById: true } })
    : null;
  if (!quote || quote.createdById !== session?.user?.id) {
    redirect("/unauthorized");
  }
}

// Carta de colores del CRM para el editor de cotizaciones (memoria de 5 min + ultima copia).
export async function getCartaColoresAction(): Promise<CartaColores> {
  await requireAdminSession();
  return leerCartaColores();
}

// Vista previa de la imagen con colores en el editor ("" = Sin vista previa de color). productId es el
// dueño de las partes (en un combo, el combo). Mismo permiso que guardar la cotización.
const previsualizarSchema = z.object({
  productId: z.string().trim().min(1).max(60),
  partes: z.array(parteElegidaSchema).min(1).max(10),
});

export async function previsualizarColoresAction(productId: unknown, partes: unknown): Promise<{ url: string }> {
  await requireAdminSession();
  const parsed = previsualizarSchema.safeParse({ productId, partes });
  if (!parsed.success) return { url: "" };
  return { url: await imagenDeColores(parsed.data.productId, parsed.data.partes) };
}

function getReturnTo(formData: FormData): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return "/admin/cotizaciones";
  }
  const value = raw.trim();
  return value || "/admin/cotizaciones";
}

// Correo -> documento -> telefono (reglas en lib/quote-creation.ts, las comparte la API del CRM).
async function upsertClientFromData(data: z.infer<typeof createClientSchema>): Promise<string> {
  return upsertQuoteClient(prisma, data);
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
  // Imagen con los colores de cada línea con partes ("" si falta una máscara o algo falla).
  const imagenes = await imagenesDeLineas(parsed.data.items);

  const normalizedItems = parsed.data.items.map((item, index) => {
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
      colorCodigo: item.colorCodigo ?? "",
      colorMaterial: item.colorMaterial ?? "",
      colorFotoUrl: item.colorFotoUrl ?? "",
      partes: item.partes,
      imagenColoresUrl: imagenes[index],
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
    const createdQuote = await createQuoteWithNextCode(prisma, {
      clientId: resolvedClientId,
      createdById,
      notes: parsed.data.notes || null,
      validUntil: validUntilDate,
      ...(createdAtDate ? { createdAt: createdAtDate } : {}),
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(total),
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
    });
    createdQuoteCode = createdQuote.code;
    createdQuoteId = createdQuote.id;
  } catch {
    redirect(`${returnTo}?error=No+se+pudo+crear+la+cotizacion`);
  }

  await logActivity({
    action: "CREATE",
    entityType: "QUOTE",
    entityId: createdQuoteId,
    entityCode: createdQuoteCode,
    summary: createdQuoteCode ? `Creó la cotización ${createdQuoteCode}` : "Creó una cotización",
    after: createdQuoteId ? await quoteForLog(prisma, createdQuoteId).catch(() => null) : null,
  });

  revalidatePath(returnTo);
  revalidatePath("/admin/cotizaciones");
  redirect(`${returnTo}?ok=Cotizacion+creada`);
}

export async function adminUpdateQuoteMetaAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  await assertQuoteOwnership(String(formData.get("quoteId") ?? "").trim());
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

  const beforeQuote = await quoteForLog(prisma, parsed.data.quoteId);
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
    entityCode: updatedQuote.code,
    summary: `Actualizó la cotización ${updatedQuote.code}`,
    before: beforeQuote,
    after: await quoteForLog(prisma, parsed.data.quoteId).catch(() => null),
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+actualizada`);
}

export async function adminUpdateQuoteFullAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  await assertQuoteOwnership(String(formData.get("quoteId") ?? "").trim());
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

  // Con venta, las líneas quedan fijas (las notas y el estado sí cambian).
  const quoteWithSale = await prisma.quote.findUnique({
    where: { id: parsed.data.quoteId },
    select: {
      code: true,
      sale: {
        select: {
          id: true,
          code: true,
          status: true,
          total: true,
          subtotal: true,
          downPaymentAmount: true,
          order: { select: { id: true, code: true, status: true, subtotal: true } },
        },
      },
      items: true,
    },
  });
  const linesLocked = Boolean(quoteWithSale?.sale);

  // Línea como se guarda (la imagen con colores se pasa aparte: no cuenta para comparar líneas).
  const normalizar = (item: (typeof parsed.data.items)[number], imagenColoresUrl: string) => {
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
    const lineTotal = calculateQuoteLineTotal(item.quantity, item.unitPrice, item.additionalCost ?? 0, item.discount ?? 0);
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
      colorCodigo: item.colorCodigo ?? "",
      colorMaterial: item.colorMaterial ?? "",
      colorFotoUrl: item.colorFotoUrl ?? "",
      partes: item.partes,
      imagenColoresUrl,
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
  };

  // Con venta, las líneas que ya tenía quedan iguales y solo se pueden sumar otras (nov-2026).
  let indicesNuevos: number[] = [];
  if (linesLocked) {
    const previas = parsed.data.items.map((item) => normalizar(item, ""));
    const nuevas = lineasAgregadas(quoteWithSale!.items, previas);
    if (!nuevas) {
      redirect(`${returnTo}?${new URLSearchParams({ error: COTIZACION_CON_VENTA_LINEAS }).toString()}`);
    }
    indicesNuevos = nuevas.map((linea) => previas.indexOf(linea));
    const sale = quoteWithSale!.sale!;
    const ordenCerrada = sale.order?.status === "COMPLETED" || sale.order?.status === "CANCELLED";
    if (indicesNuevos.length > 0 && (sale.status === "CANCELLED" || ordenCerrada)) {
      redirect(
        `${returnTo}?${new URLSearchParams({ error: "La venta está cancelada o su orden ya se cerró: no se le pueden agregar productos." }).toString()}`,
      );
    }
  }
  // El servidor no confía en la pantalla: color y descuento se revisan antes de escribir nada
  // (con venta, solo en las líneas nuevas).
  const aRevisar = linesLocked ? indicesNuevos : parsed.data.items.map((_, index) => index);
  if (aRevisar.length > 0) {
    const comboCodes = [...new Set(parsed.data.items.map((item) => item.comboCode?.trim() ?? "").filter(Boolean))];
    const combos = comboCodes.length
      ? await prisma.product.findMany({ where: { code: { in: comboCodes } }, select: { id: true, code: true, name: true } })
      : [];
    const comboByCode = new Map(combos.map((combo) => [combo.code, combo]));
    // Mismo dueño que el editor: una línea de combo, el combo por su código; una suelta, su producto.
    const duenios = parsed.data.items.map((item) =>
      item.comboKey ? (item.comboCode ? comboByCode.get(item.comboCode) : undefined) : productMap.get(item.productId),
    );
    const partes = await partesPorProducto(
      prisma,
      duenios.flatMap((duenio) => (duenio ? [duenio.id] : [])),
    );
    const error = errorAlGuardarLineas(
      aRevisar.map((index) => {
        const item = parsed.data.items[index];
        const duenio = duenios[index];
        return {
          etiqueta: displayCode(item.comboCode || duenio?.code || "") || item.comboName || duenio?.name || "Producto",
          requeridas: (duenio ? (partes.get(duenio.id) ?? []) : []).map((parte) => parte.nombre),
          elegidos: item.partes,
          combo: Boolean(item.comboKey),
          color: item.color ?? "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount ?? 0,
          additionalCost: item.additionalCost ?? 0,
          comboKey: item.comboKey,
        };
      }),
    );
    if (error) {
      redirect(`${returnTo}?${new URLSearchParams({ error }).toString()}`);
    }
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

  // La imagen con colores solo se rehace en las líneas que se van a guardar (con venta, las nuevas).
  const aImagen = linesLocked ? indicesNuevos : parsed.data.items.map((_, index) => index);
  const imagenesHechas = aImagen.length > 0 ? await imagenesDeLineas(aImagen.map((index) => parsed.data.items[index])) : [];
  const imagenes = parsed.data.items.map((_, index) => {
    const posicion = aImagen.indexOf(index);
    return posicion >= 0 ? (imagenesHechas[posicion] ?? "") : "";
  });

  const normalizedItems = parsed.data.items.map((item, index) => normalizar(item, imagenes[index]));

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const total = subtotal;

  if (linesLocked && indicesNuevos.length === 0 && !mismasLineas(quoteWithSale!.items, normalizedItems)) {
    redirect(`${returnTo}?${new URLSearchParams({ error: COTIZACION_CON_VENTA_LINEAS }).toString()}`);
  }

  const beforeQuote = await quoteForLog(prisma, parsed.data.quoteId);
  const datosCotizacion = {
    clientId: resolvedClientId,
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    validUntil: validUntilDate,
    ...(createdAtDate ? { createdAt: createdAtDate } : {}),
  };
  if (linesLocked && indicesNuevos.length > 0) {
    const agregado = await agregarLineasAVenta({
      quoteId: parsed.data.quoteId,
      quoteCode: quoteWithSale!.code,
      sale: quoteWithSale!.sale!,
      lineas: indicesNuevos.map((index) => normalizedItems[index]),
      datosCotizacion,
    });
    revalidatePath("/admin/cotizaciones");
    revalidatePath("/admin/ventas");
    revalidatePath("/admin/ordenes");
    revalidatePath(returnTo);
    redirect(`/admin/cotizaciones?${new URLSearchParams({ ok: agregado }).toString()}`);
  }
  const updatedQuote = await prisma.quote.update({
    where: { id: parsed.data.quoteId },
    data: linesLocked
      ? datosCotizacion
      : {
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
    entityCode: updatedQuote.code,
    summary: `Actualizó la cotización ${updatedQuote.code}`,
    before: beforeQuote,
    after: await quoteForLog(prisma, parsed.data.quoteId).catch(() => null),
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`/admin/cotizaciones?ok=Cotizacion+actualizada`);
}

export async function adminDeleteQuoteAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  await assertQuoteOwnership(String(formData.get("quoteId") ?? "").trim());
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

  let actor;
  try {
    actor = await getActivityActor();
  } catch {
    redirect("/unauthorized");
  }

  // Copia completa en la bitácora y borrado en la misma transacción: sin copia no se borra.
  try {
    await prisma.$transaction(async (tx) => {
      const quoteToDelete = await tx.quote.findUnique({ where: { id: quoteId }, include: { items: true } });
      if (!quoteToDelete) return;
      await logActivityTx(tx, actor, {
        action: "DELETE",
        entityType: "QUOTE",
        entityId: quoteId,
        entityCode: quoteToDelete.code,
        summary: `Eliminó la cotización ${quoteToDelete.code}`,
        before: fullCopyForLog(quoteToDelete),
      });
      await tx.quote.delete({ where: { id: quoteId } });
    });
  } catch (error) {
    console.error("Failed to delete quote:", error);
    redirect(`${returnTo}?error=No+se+pudo+eliminar+la+cotizacion`);
  }

  revalidatePath("/admin/cotizaciones");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Cotizacion+eliminada`);
}
