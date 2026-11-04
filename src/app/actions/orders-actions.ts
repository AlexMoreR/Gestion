"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { getActivityActor, logActivity, logActivityTx } from "@/lib/activity-log";
import type { CartaColores } from "@/lib/carta-colores-crm";
import { leerCartaColores } from "@/lib/carta-colores-crm.server";
import {
  linesToRecolor,
  mismoColor,
  notesWithNewColor,
  parseColorChangeReason,
  parseNuevoColor,
  partesCambiadas,
  type NuevoColor,
} from "@/lib/color-change";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { imagenesDeColores } from "@/lib/vista-color.server";
import { partesPorProducto } from "@/lib/product-parts.server";
import type { ParteElegida, ParteParaCotizar } from "@/lib/product-parts";
import { stockToRestore } from "@/lib/order-stock-restore";
import { prisma } from "@/lib/prisma";
import { parseOrderNoteText } from "@/lib/order-notes";
import { createSaleOrder, type CreateSaleOrderResult } from "@/lib/sale-order";
import { isRetiredUser } from "@/modules/equipo/infrastructure/prisma-team-repository";

// Mismos mensajes de siempre del formulario de ventas.
const CREATE_ORDER_ERRORS: Record<Extract<CreateSaleOrderResult, { ok: false }>["motivo"], string> = {
  venta_no_encontrada: "Venta+no+encontrada",
  ya_tiene_orden: "Esta+venta+ya+tiene+una+orden",
  responsable_invalido: "Responsable+invalido",
  responsable_retirado: "Esa+persona+ya+salio+del+equipo",
};

const createOrderSchema = z.object({
  saleId: z.string().trim().min(1, "Venta invalida"),
  internalNotes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
  assignedToId: z.string().trim().optional(),
});

const updateOrderStatusSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  status: z.enum([
    "DRAFT",
    "RELEASED",
    "IN_PRODUCTION",
    "READY_FOR_DISPATCH",
    "DISPATCHED",
    "COMPLETED",
    "CANCELLED",
  ]),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
});

const assignOrderSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  assignedToId: z.string().trim().min(1, "Responsable invalido"),
});

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))) {
    redirect("/unauthorized");
  }

  return session.user.id;
}

function getReturnTo(formData: FormData, fallback: string): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return fallback;
  }

  const value = raw.trim();
  return value || fallback;
}

function parseAllowedOrderStatusTransitions(status: string): string[] {
  switch (status) {
    case "DRAFT":
      return ["RELEASED", "CANCELLED"];
    case "RELEASED":
      return ["IN_PRODUCTION", "CANCELLED"];
    case "IN_PRODUCTION":
      return ["READY_FOR_DISPATCH", "CANCELLED"];
    case "READY_FOR_DISPATCH":
      return ["DISPATCHED", "CANCELLED"];
    case "DISPATCHED":
      return ["COMPLETED", "CANCELLED"];
    case "COMPLETED":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

export async function syncOrderStatusAfterProduction(
  tx: Prisma.TransactionClient,
  orderId: string,
  changedById: string,
): Promise<boolean> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!order || order.status === "CANCELLED" || order.status === "COMPLETED" || order.status === "DISPATCHED") {
    return false;
  }

  const jobs = await tx.productionJob.findMany({
    where: { orderId },
    select: { status: true },
  });

  if (jobs.length === 0) {
    return false;
  }

  const hasOpenJobs = jobs.some((job) => job.status === "PENDING" || job.status === "IN_PROGRESS" || job.status === "PAUSED");
  const hasDoneJobs = jobs.some((job) => job.status === "DONE");

  if (!hasOpenJobs && hasDoneJobs) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "READY_FOR_DISPATCH",
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "READY_FOR_DISPATCH",
        note: "Produccion completada",
        changedById,
      },
    });
    return true;
  }

  return false;
}
export async function adminCreateOrderFromSaleAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ventas");

  const parsed = createOrderSchema.safeParse({
    saleId: formData.get("saleId"),
    internalNotes: formData.get("internalNotes") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+orden+invalidos`);
  }

  let result: CreateSaleOrderResult;
  try {
    result = await prisma.$transaction((tx) =>
      createSaleOrder(tx, {
        saleId: parsed.data.saleId,
        actorId: createdById,
        assigneeId: parsed.data.assignedToId,
        internalNotes: parsed.data.internalNotes,
      }),
    );
  } catch (error) {
    console.error("Failed to create order:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+la+orden`);
  }

  if (!result.ok) {
    redirect(`${returnTo}?error=${CREATE_ORDER_ERRORS[result.motivo]}`);
  }

  await logActivity({
    action: "CREATE",
    entityType: "ORDER",
    entityId: result.orderId,
    entityCode: result.orderCode,
    summary: `Creó la orden ${result.orderCode}`,
    after: { saleId: parsed.data.saleId, assignedToId: parsed.data.assignedToId ?? null },
  });

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/ordenes");
  redirect(`${returnTo}?ok=Orden+creada`);
}

export async function adminUpdateOrderStatusAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = updateOrderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+orden+invalidos`);
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true, createdById: true, code: true },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  const allowedTransitions = parseAllowedOrderStatusTransitions(order.status);
  if (!allowedTransitions.includes(parsed.data.status)) {
    redirect(`${returnTo}?error=Transicion+de+estado+invalida`);
  }

  // A DESPACHADO solo se llega creando el despacho, que exige el pago del flete (cuenta y comprobante).
  if (parsed.data.status === "DISPATCHED") {
    const activeDispatch = await prisma.dispatch.findFirst({
      where: { orderId: order.id, status: { notIn: ["CANCELLED", "RETURNED"] } },
      select: { id: true },
    });
    if (!activeDispatch) {
      redirect(`${returnTo}?error=${encodeURIComponent("Crea el despacho con el pago del flete")}`);
    }
  }

  const updateData: Record<string, unknown> = {
    status: parsed.data.status,
  };

  if (parsed.data.status === "RELEASED") {
    updateData.releasedAt = new Date();
  }

  if (parsed.data.status === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: updateData,
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: parsed.data.status,
        note: parsed.data.note || null,
        changedById,
      },
    });
  });

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: order.id,
    entityCode: order.code,
    summary: `Actualizó la orden ${order.code} a estado ${parsed.data.status}`,
    before: { status: order.status },
    after: { status: parsed.data.status, note: parsed.data.note || null },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  redirect(`${returnTo}?ok=Orden+actualizada`);
}

export async function adminAssignOrderAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = assignOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    assignedToId: formData.get("assignedToId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+asignacion+invalidos`);
  }

  const isValid = await prisma.user.findFirst({
    where: {
      id: parsed.data.assignedToId,
      role: { in: ["ADMIN", "EMPLEADO"] },
    },
    select: { id: true },
  });

  if (!isValid) {
    redirect(`${returnTo}?error=Responsable+invalido`);
  }
  if (await isRetiredUser(isValid.id)) {
    redirect(`${returnTo}?error=Esa+persona+ya+salio+del+equipo`);
  }

  const previous = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { assignedToId: true },
  });
  const assignedOrder = await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { assignedToId: parsed.data.assignedToId },
    select: { code: true },
  });

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: parsed.data.orderId,
    entityCode: assignedOrder.code,
    summary: `Asignó la orden ${assignedOrder.code}`,
    before: { assignedToId: previous?.assignedToId ?? null },
    after: { assignedToId: parsed.data.assignedToId },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`${returnTo}`);
  redirect(`${returnTo}?ok=Orden+asignada`);
}

// Ruta fija del detalle: no se toma returnTo del formulario para no redirigir a donde sea.
function orderDetailPath(orderId: string): string {
  return `/admin/ordenes/${encodeURIComponent(orderId)}`;
}

export async function adminAddOrderNoteAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) {
    redirect("/admin/ordenes?error=Orden+invalida");
  }
  const back = orderDetailPath(orderId);

  const parsed = parseOrderNoteText(formData.get("text"));
  if (!parsed.ok) {
    redirect(`${back}?error=${encodeURIComponent(parsed.error)}`);
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, code: true } });
  if (!order) {
    redirect("/admin/ordenes?error=Orden+no+encontrada");
  }

  const note = await prisma.orderNote.create({
    data: { orderId: order.id, text: parsed.text, createdById: userId },
    select: { id: true },
  });

  // UPDATE: la nota es un cambio de la orden, no una orden nueva.
  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: order.id,
    entityCode: order.code,
    summary: `Agregó una nota: ${parsed.text}`,
    after: { noteId: note.id, text: parsed.text },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(back);
  redirect(`${back}?ok=Nota+agregada`);
}

// La carta de colores para "Cambiar color" en la orden (la de cotizaciones pide permiso de Cotizaciones).
export async function getCartaColoresOrdenAction(): Promise<CartaColores> {
  await requireAdminSession();
  return leerCartaColores();
}

// Lo que lee «Cambiar color»: la orden de venta, las líneas de su cotización y cuáles cambian.
async function lineasParaCambioDeColor(db: Prisma.TransactionClient, orderId: string, orderItemId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      sale: { select: { code: true, status: true, quoteId: true } },
      items: { select: { id: true, quoteItemId: true, productId: true, notes: true, product: { select: { name: true } } } },
    },
  });
  if (!order || order.type !== "SALE" || !order.sale) return { error: "Solo se cambia el color en una orden de venta." };
  if (order.status === "CANCELLED" || order.sale.status === "CANCELLED") {
    return { error: "La venta está cancelada: no se puede cambiar el color." };
  }
  const quoteItems = await db.quoteItem.findMany({
    where: { quoteId: order.sale.quoteId },
    select: { id: true, productId: true, notes: true, product: { select: { name: true, isBundle: true } } },
  });
  const lines = linesToRecolor(
    orderItemId,
    quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const clicked = order.items.find((o) => o.id === orderItemId);
  if (!lines || !clicked) return { error: "Producto no encontrado." };
  return { order: { ...order, sale: order.sale }, quoteItems, lines, clicked };
}

/**
 * Imagen nueva de cada línea que cambia (id → notas leídas + URL). Cada línea de la cotización se pinta con su
 * producto (el combo en un combo); la orden copia la de su línea (las piezas de un combo sin desglosar, la del combo).
 */
async function imagenesParaCambioDeColor(orderId: string, orderItemId: string, nuevo: NuevoColor) {
  const resultado = new Map<string, { notes: string | null; url: string }>();
  const leidas = await lineasParaCambioDeColor(prisma, orderId, orderItemId);
  if ("error" in leidas) return resultado;
  const { order, quoteItems, lines } = leidas;
  const quoteTargets = quoteItems.filter((q) => lines.quoteItemIds.includes(q.id));
  const orderTargets = order.items.filter((o) => lines.orderItemIds.includes(o.id));
  const fuente = (o: (typeof orderTargets)[number]) =>
    quoteTargets.find((q) => q.id === o.quoteItemId) ?? (o.quoteItemId ? undefined : quoteTargets[0]);
  const entrada = (productId: string, notes: string | null) => {
    const meta = parseQuoteItemMeta(notes);
    return { productId, comboCode: meta.comboCode, partes: partesCambiadas(meta.partes, nuevo.partes ?? []) };
  };
  const lista = [
    ...quoteTargets.map((q) => ({ id: q.id, notes: q.notes, ...entrada(q.productId, q.notes) })),
    ...orderTargets.map((o) => {
      // La pieza se pinta como su línea de la cotización (mismo producto y combo), con sus propias partes.
      const q = fuente(o);
      return { id: o.id, notes: o.notes, ...entrada(q?.productId ?? o.productId, o.notes), comboCode: parseQuoteItemMeta(q?.notes ?? o.notes).comboCode };
    }),
  ];
  const urls = await imagenesDeColores(lista);
  lista.forEach((linea, i) => resultado.set(linea.id, { notes: linea.notes, url: urls[i] }));
  return resultado;
}

export type PartesDeLineaOrden = { productId: string | null; partes: ParteParaCotizar[]; elegidos: ParteElegida[] };

/** Partes de color del producto de una línea (el combo en un combo) y lo elegido, para «Cambiar color». */
export async function getPartesColorOrdenAction(orderItemId: unknown): Promise<PartesDeLineaOrden> {
  await requireAdminSession();
  const vacio: PartesDeLineaOrden = { productId: null, partes: [], elegidos: [] };
  const id = typeof orderItemId === "string" ? orderItemId.trim().slice(0, 60) : "";
  const item = id ? await prisma.orderItem.findUnique({ where: { id }, select: { orderId: true } }) : null;
  if (!item) return vacio;
  const leidas = await lineasParaCambioDeColor(prisma, item.orderId, id);
  if ("error" in leidas) return vacio;
  const fuente = leidas.quoteItems.find((q) => q.id === leidas.lines.quoteItemIds[0]);
  const comboCode = parseQuoteItemMeta(fuente?.notes ?? leidas.clicked.notes).comboCode.trim();
  const combo = comboCode ? await prisma.product.findFirst({ where: { code: comboCode }, select: { id: true } }) : null;
  const productId = combo?.id ?? fuente?.productId ?? leidas.clicked.productId;
  const partes = (await partesPorProducto(prisma, [productId])).get(productId) ?? [];
  return { productId, partes, elegidos: parseQuoteItemMeta(leidas.clicked.notes).partes };
}

// Cambia SOLO el color de un producto de una venta activa (cotización + orden; en un combo, todas sus
// piezas), con motivo. Solo escribe las notas de las líneas, una nota de la orden y la bitácora:
// no toca precios, totales, abonos, costos, estados, fechas ni avisa a nadie.
export async function adminChangeSaleItemColorAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const item = orderItemId
    ? await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } })
    : null;
  if (!item) {
    redirect("/admin/ordenes?error=Producto+no+encontrado");
  }
  const back = orderDetailPath(item.orderId);

  const motivo = parseColorChangeReason(formData.get("motivo"));
  if (!motivo.ok) redirect(`${back}?error=${encodeURIComponent(motivo.error)}`);
  const nuevo = parseNuevoColor({
    color: formData.get("color"),
    colorCodigo: formData.get("colorCodigo"),
    colorMaterial: formData.get("colorMaterial"),
    colorFotoUrl: formData.get("colorFotoUrl"),
    partes: formData.get("partes"),
  });
  if (!nuevo.ok) redirect(`${back}?error=${encodeURIComponent(nuevo.error)}`);

  // Con partes: la imagen nueva de cada línea se hace antes y fuera de la transacción (lee archivos).
  // Si la nota cambió entre medio, esa línea queda sin imagen (nunca con una vieja).
  const imagenes = nuevo.value.partes?.length
    ? await imagenesParaCambioDeColor(item.orderId, orderItemId, nuevo.value)
    : new Map<string, { notes: string | null; url: string }>();
  const imagenDe = (id: string, notes: string | null) => {
    const hecha = imagenes.get(id);
    return hecha && hecha.notes === notes ? hecha.url : "";
  };

  const actor = await getActivityActor();
  const result = await prisma.$transaction(async (tx) => {
    const leidas = await lineasParaCambioDeColor(tx, item.orderId, orderItemId);
    if ("error" in leidas) return { error: leidas.error };
    const { order, quoteItems, lines, clicked } = leidas;
    if (mismoColor(clicked.notes, nuevo.value)) return { error: "Ese ya es el color de este producto." };

    const before = quoteItems.filter((q) => lines.quoteItemIds.includes(q.id));
    const beforeOrder = order.items.filter((o) => lines.orderItemIds.includes(o.id));
    for (const q of before) {
      await tx.quoteItem.update({ where: { id: q.id }, data: { notes: notesWithNewColor(q.notes, nuevo.value, imagenDe(q.id, q.notes)) } });
    }
    for (const o of beforeOrder) {
      await tx.orderItem.update({ where: { id: o.id }, data: { notes: notesWithNewColor(o.notes, nuevo.value, imagenDe(o.id, o.notes)) } });
    }

    // Nombre que se reconoce: el del combo (desglosado o no) o el del producto.
    const meta = parseQuoteItemMeta(before[0]?.notes ?? clicked.notes);
    const producto = meta.comboName || before[0]?.product.name || clicked.product.name;
    const viejo = parseQuoteItemMeta(clicked.notes).color.trim() || "sin color";
    const text = `Cambio de color de ${producto}: ${viejo} → ${nuevo.value.color}. Motivo: ${motivo.value}`;
    await tx.orderNote.create({ data: { orderId: order.id, text, createdById: actor.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "ORDER",
      entityId: order.id,
      entityCode: order.code,
      summary: `${text} (${order.sale.code})`,
      before: {
        quoteItems: before.map((q) => ({ id: q.id, notes: q.notes })),
        orderItems: beforeOrder.map((o) => ({ id: o.id, notes: o.notes })),
      },
      after: { color: nuevo.value, motivo: motivo.value, quoteItemIds: lines.quoteItemIds, orderItemIds: lines.orderItemIds },
    });
    return { error: null };
  });
  if (result.error) redirect(`${back}?error=${encodeURIComponent(result.error)}`);

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Color cambiado")}`);
}

export async function adminDeleteOrderNoteAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const noteId = String(formData.get("noteId") ?? "").trim();
  const note = noteId
    ? await prisma.orderNote.findUnique({
        where: { id: noteId },
        select: { id: true, text: true, createdById: true, orderId: true, order: { select: { code: true } } },
      })
    : null;
  if (!note) {
    redirect("/admin/ordenes?error=Nota+no+encontrada");
  }
  const back = orderDetailPath(note.orderId);
  if (note.createdById !== userId) {
    redirect(`${back}?error=${encodeURIComponent("Solo puedes borrar tus notas")}`);
  }

  // deleteMany con el autor en el where: si cambió entre la lectura y el borrado, no borra nada ajeno.
  await prisma.orderNote.deleteMany({ where: { id: note.id, createdById: userId } });

  // Se anota como cambio de la orden (UPDATE): el Revisor diario lee DELETE de ORDER como orden borrada.
  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: note.orderId,
    entityCode: note.order.code,
    summary: `Borró una nota: ${note.text}`,
    before: { noteId: note.id, text: note.text },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(back);
  redirect(`${back}?ok=Nota+borrada`);
}

export async function adminCancelOrderAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderId = String(formData.get("orderId") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!orderId) {
    redirect(`${returnTo}?error=Orden+invalida`);
  }
  if (!note) {
    redirect(`${returnTo}?error=${encodeURIComponent("Escribe el motivo para anular la orden.")}`);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      type: true,
      status: true,
      code: true,
      purchaseCode: true,
      items: {
        select: { productId: true, quantity: true, fulfillmentMode: true, confirmedAt: true },
      },
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  // Una compra completada sí se puede anular (no se borra); una venta completada no.
  if (order.status === "CANCELLED" || (order.status === "COMPLETED" && order.type !== "PURCHASE")) {
    redirect(`${returnTo}?error=La+orden+no+puede+cancelarse`);
  }

  // Repone el inventario de los items "por stock" que ya se habian confirmado
  // (su salida OUT se registro al confirmar). Los no confirmados nunca tocaron
  // stock y los de fabricacion tampoco.
  // Una compra no repone nada: sus items son ENTRADAS, no salidas. Anularla no toca
  // stock ni cargos ni pagos (todo queda visible); ajustarlos es a mano.
  const restoreByProduct = stockToRestore(order.type === "PURCHASE" ? [] : order.items);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        note,
        changedById,
      },
    });

    if (restoreByProduct.size > 0) {
      await tx.inventoryMovement.createMany({
        data: Array.from(restoreByProduct.entries()).map(([productId, quantity]) => ({
          productId,
          type: "IN" as const,
          change: quantity,
          note: `Reversa por cancelacion de orden ${order.code}`,
          createdById: changedById,
        })),
      });
    }
  });

  await logActivity({
    action: "DELETE",
    entityType: order.type === "PURCHASE" ? "PURCHASE" : "ORDER",
    entityId: order.id,
    entityCode: order.purchaseCode ?? order.code,
    summary: `Canceló la orden ${order.code}${order.purchaseCode ? ` (compra ${order.purchaseCode})` : ""}. Motivo: ${note}`,
    before: { status: order.status, orderCode: order.code },
    after: { status: "CANCELLED", motivo: note },
  });

  revalidatePath("/admin/ordenes");
  if (restoreByProduct.size > 0) {
    revalidatePath("/admin/inventario");
  }
  revalidatePath(`${returnTo}`);
  redirect(`${returnTo}?ok=Orden+cancelada`);
}

export async function adminMoveOrderToReadyForDispatchAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "READY_FOR_DISPATCH");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToProductionAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "IN_PRODUCTION");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToDispatchedAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "DISPATCHED");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToCompletedAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "COMPLETED");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}
