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
  duenioDePartes,
  lineaFuente,
  linesToRecolor,
  mismoColor,
  notesWithNewColor,
  parseColorChangeReason,
  ofsConCambioDeColor,
  parseNuevoColor,
  partesConCambio,
  type NuevoColor,
} from "@/lib/color-change";
import { guardarImagenOF } from "@/lib/of-image.server";
import { imagenManualDe, notaCambioImagen, notesWithOfImage, validarArchivoImagenOF } from "@/lib/of-image";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { imagenDeColores } from "@/lib/vista-color.server";
import { stockToRestore } from "@/lib/order-stock-restore";
import { prisma } from "@/lib/prisma";
import { parseOrderNoteText } from "@/lib/order-notes";
import {
  cancelBlock,
  cancelNote,
  cancelReasonLabel,
  openManufacturingOrders,
  parseCancelInput,
  parseReactivateInput,
} from "@/lib/order-cancellation";
import { missingDispatchItems } from "@/lib/order-dispatch";
import { createSaleOrder, type CreateSaleOrderResult } from "@/lib/sale-order";
import { parseCancelItemReason } from "@/lib/sale-item-cancel";
import {
  CancelItemBlockedError,
  cancelarProductoTx,
  formatCop,
  reactivarOrdenTx,
  type ResultadoCancelar,
} from "@/lib/sale-item-swap.server";
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

  // Ya lista: no se repite «Lista para despacho → Lista para despacho» en el historial.
  if (
    !order ||
    order.status === "CANCELLED" ||
    order.status === "COMPLETED" ||
    order.status === "DISPATCHED" ||
    order.status === "READY_FOR_DISPATCH"
  ) {
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
    const activeDispatches = await prisma.dispatch.findMany({
      where: { orderId: order.id, status: { notIn: ["CANCELLED", "RETURNED"] } },
      select: { items: { select: { orderItemId: true } } },
    });
    if (activeDispatches.length === 0) {
      redirect(`${returnTo}?error=${encodeURIComponent("Crea el despacho con el pago del flete")}`);
    }
    // Solo con todos los productos despachados. Despachos viejos sin productos ligados: como antes.
    const dispatchedIds = activeDispatches.flatMap((dispatch) => dispatch.items.map((row) => row.orderItemId));
    if (dispatchedIds.length > 0) {
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        select: { id: true, product: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      const missing = missingDispatchItems(items, dispatchedIds);
      if (missing.length > 0) {
        const names = missing.map((item) => item.product.name).join(", ");
        redirect(`${returnTo}?error=${encodeURIComponent(`Faltan por despachar: ${names}`)}`);
      }
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

/**
 * Imagen con los colores nuevos de cada línea que cambia (cotización y orden), por id de línea, con la firma
 * de sus partes: en la transacción se usa solo si las partes salen iguales. Fuera de la transacción porque
 * sharp puede tardar; si algo falla la línea queda sin imagen ("").
 */
async function imagenesDelCambio(orderId: string, orderItemId: string, nuevo: NuevoColor) {
  const resultado = new Map<string, { firma: string; url: string }>();
  if (!nuevo.partes?.length) return resultado;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      sale: { select: { quoteId: true } },
      items: { select: { id: true, quoteItemId: true, productId: true, notes: true } },
    },
  });
  if (!order?.sale) return resultado;
  const quoteItems = await prisma.quoteItem.findMany({
    where: { quoteId: order.sale.quoteId },
    select: { id: true, productId: true, notes: true, product: { select: { name: true, isBundle: true } } },
  });
  const cotizacion = quoteItems.map((q) => ({ id: q.id, productId: q.productId, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle }));
  const lines = linesToRecolor(orderItemId, cotizacion, order.items);
  if (!lines) return resultado;
  const codigos = [
    ...new Set([...cotizacion, ...order.items].map((l) => parseQuoteItemMeta(l.notes).comboCode.trim()).filter(Boolean)),
  ];
  const combos = codigos.length
    ? await prisma.product.findMany({ where: { code: { in: codigos } }, select: { id: true, code: true } })
    : [];
  const idPorCodigo = new Map(combos.flatMap((c) => (c.code ? [[c.code, c.id] as const] : [])));

  const lineas = [
    ...cotizacion.filter((q) => lines.quoteItemIds.includes(q.id)).map((q) => ({ linea: q, fuente: q })),
    ...order.items.filter((o) => lines.orderItemIds.includes(o.id)).map((o) => ({ linea: o, fuente: lineaFuente(o, cotizacion) })),
  ];
  const hechas = new Map<string, Promise<string>>();
  await Promise.all(
    lineas.map(async ({ linea, fuente }) => {
      const partes = partesConCambio(linea.notes, nuevo);
      const duenio = duenioDePartes(linea, fuente, idPorCodigo);
      const llave = JSON.stringify([duenio, partes]);
      if (!hechas.has(llave)) hechas.set(llave, imagenDeColores(duenio, partes));
      resultado.set(linea.id, { firma: JSON.stringify(partes), url: await hechas.get(llave)! });
    }),
  );
  return resultado;
}

// Cambia SOLO el color de un producto de una venta activa (cotización + orden; en un combo, todas sus
// piezas), con motivo. Solo escribe las notas de las líneas, una nota de la orden, la bitácora y un aviso
// por cada OF afectada (lo ve la proveedora en su OF; no se le manda nada solo). No toca precios,
// totales, abonos, costos, estados ni fechas.
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

  const imagenes = await imagenesDelCambio(item.orderId, orderItemId, nuevo.value);
  // La imagen rehecha solo si las partes de la línea siguen siendo las que se usaron para hacerla.
  const imagenDe = (id: string, notes: string | null) => {
    const hecha = imagenes.get(id);
    return hecha && hecha.firma === JSON.stringify(partesConCambio(notes, nuevo.value)) ? hecha.url : "";
  };

  const actor = await getActivityActor();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: item.orderId },
      select: {
        id: true,
        code: true,
        type: true,
        status: true,
        sale: { select: { code: true, status: true, quoteId: true } },
        items: {
          select: {
            id: true,
            quoteItemId: true,
            notes: true,
            confirmedSupplierId: true,
            fulfillmentMode: true,
            product: { select: { name: true } },
          },
        },
        manufacturingOrders: {
          select: { id: true, supplierId: true, supplier: { select: { name: true, displayName: true } } },
        },
      },
    });
    if (!order || order.type !== "SALE" || !order.sale) return { error: "Solo se cambia el color en una orden de venta.", proveedoras: [] };
    if (order.status === "CANCELLED" || order.sale.status === "CANCELLED") {
      return { error: "La venta está cancelada: no se puede cambiar el color.", proveedoras: [] };
    }
    const quoteItems = await tx.quoteItem.findMany({
      where: { quoteId: order.sale.quoteId },
      select: { id: true, notes: true, product: { select: { name: true, isBundle: true } } },
    });
    const lines = linesToRecolor(
      orderItemId,
      quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
      order.items,
    );
    const clicked = order.items.find((o) => o.id === orderItemId);
    if (!lines || !clicked) return { error: "Producto no encontrado.", proveedoras: [] };
    if (mismoColor(clicked.notes, nuevo.value)) return { error: "Ese ya es el color de este producto.", proveedoras: [] };

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
    // Aviso a cada proveedora con una OF que tenga alguna de estas líneas (se ve arriba en su OF).
    const ofIds = ofsConCambioDeColor(beforeOrder, order.manufacturingOrders);
    if (ofIds.length > 0) {
      await tx.avisoColorOF.createMany({
        data: ofIds.map((manufacturingOrderId) => ({
          manufacturingOrderId,
          producto,
          colorViejo: viejo,
          colorNuevo: nuevo.value.color,
          creadoPorId: actor.id,
        })),
      });
    }
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
      after: {
        color: nuevo.value,
        motivo: motivo.value,
        quoteItemIds: lines.quoteItemIds,
        orderItemIds: lines.orderItemIds,
        avisoColorOFs: ofIds,
      },
    });
    const proveedoras = order.manufacturingOrders
      .filter((of) => ofIds.includes(of.id))
      .map((of) => of.supplier.displayName || of.supplier.name);
    return { error: null, proveedoras };
  });
  if (result.error) redirect(`${back}?error=${encodeURIComponent(result.error)}`);
  const ok = result.proveedoras.length
    ? `Color cambiado. Avísale a ${result.proveedoras.join(" y ")} en la pestaña Fabricación`
    : "Color cambiado";

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(ok)}`);
}

// Cambia SOLO la imagen que ve la proveedora en un producto de la OF (o la vuelve a la del catálogo).
// Escribe únicamente las notas de ESA línea de la orden (imageUrl), una nota de la orden y la bitácora:
// no toca el producto del catálogo, la cotización, otras órdenes, precios, costos, pagos ni estados.
export async function adminChangeOrderItemImageAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const item = orderItemId
    ? await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } })
    : null;
  if (!item) {
    redirect("/admin/ordenes?error=Producto+no+encontrado");
  }
  const back = orderDetailPath(item.orderId);
  const restaurar = String(formData.get("accion") ?? "") === "restaurar";

  let url = "";
  if (!restaurar) {
    const archivo = formData.get("imagen");
    if (!(archivo instanceof File)) {
      redirect(`${back}?error=${encodeURIComponent("Escoge una imagen.")}`);
    }
    const valida = validarArchivoImagenOF(archivo);
    if (!valida.ok) redirect(`${back}?error=${encodeURIComponent(valida.error)}`);
    try {
      url = (await guardarImagenOF(archivo)).url;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudo guardar la imagen.";
      redirect(`${back}?error=${encodeURIComponent(mensaje)}`);
    }
  }

  const actor = await getActivityActor();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: item.orderId },
      select: {
        id: true,
        code: true,
        type: true,
        status: true,
        sale: { select: { code: true, status: true } },
        items: { where: { id: orderItemId }, select: { id: true, notes: true, product: { select: { name: true } } } },
      },
    });
    if (!order || order.type !== "SALE" || !order.sale) return { error: "Solo se cambia la imagen en una orden de venta." };
    if (order.status === "CANCELLED" || order.sale.status === "CANCELLED") {
      return { error: "La venta está cancelada: no se puede cambiar la imagen." };
    }
    const linea = order.items[0];
    if (!linea) return { error: "Producto no encontrado." };
    const antes = imagenManualDe(linea.notes);
    if (restaurar && !antes) return { error: "Este producto ya usa la imagen del catálogo." };

    await tx.orderItem.update({ where: { id: linea.id }, data: { notes: notesWithOfImage(linea.notes, url) } });
    const persona = actor.name?.trim() || actor.email?.trim() || "Desconocido";
    const text = notaCambioImagen(linea.product.name, persona, restaurar);
    await tx.orderNote.create({ data: { orderId: order.id, text, createdById: userId } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "ORDER",
      entityId: order.id,
      entityCode: order.code,
      summary: `${text} (${order.sale.code})`,
      before: { orderItemId: linea.id, imageUrl: antes },
      after: { orderItemId: linea.id, imageUrl: url },
    });
    return { error: null };
  });
  if (result.error) redirect(`${back}?error=${encodeURIComponent(result.error)}`);

  revalidatePath("/admin/ordenes");
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(restaurar ? "Imagen restaurada a la del catálogo" : "Imagen cambiada")}`);
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
  if (!orderId) {
    redirect(`${returnTo}?error=Orden+invalida`);
  }
  const parsedCancel = parseCancelInput(formData);
  if (!parsedCancel.ok) {
    redirect(`${returnTo}?error=${encodeURIComponent(parsedCancel.error)}`);
  }
  const cancel = parsedCancel.value;
  const note = cancelNote(cancel);

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

  // Con un despacho vivo no se cancela (se revisa aquí, no solo en la pantalla). Las OF abiertas
  // no se cancelan solas: solo quedan anotadas en la bitácora.
  const [dispatches, manufacturingOrders] = await Promise.all([
    prisma.dispatch.findMany({ where: { orderId: order.id }, select: { status: true } }),
    prisma.manufacturingOrder.findMany({ where: { orderId: order.id }, select: { code: true, receivedAt: true } }),
  ]);
  const blocked = cancelBlock(dispatches);
  if (blocked) {
    redirect(`${returnTo}?error=${encodeURIComponent(blocked)}`);
  }
  const ofsAbiertas = openManufacturingOrders(manufacturingOrders).map((of) => of.code);

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
    summary: `Canceló la orden ${order.code}${order.purchaseCode ? ` (compra ${order.purchaseCode})` : ""}. ${note}`,
    before: { status: order.status, orderCode: order.code },
    after: {
      status: "CANCELLED",
      motivo: cancelReasonLabel(cancel.reason) + (cancel.reasonText ? ` — ${cancel.reasonText}` : ""),
      motivoClave: cancel.reason,
      notas: cancel.notas,
      ofsAbiertas,
    },
  });

  revalidatePath("/admin/ordenes");
  if (restoreByProduct.size > 0) {
    revalidatePath("/admin/inventario");
  }
  revalidatePath(`${returnTo}`);
  redirect(`${returnTo}?ok=Orden+cancelada`);
}

// Reactivar una orden de venta cancelada (nov-2026): vuelve al estado de antes de la última cancelación y saca
// otra vez del stock lo que la cancelación repuso. No toca la venta, los abonos ni Balances.
export async function adminReactivateOrderAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderId = String(formData.get("orderId") || "").trim();
  if (!orderId) {
    redirect(`${returnTo}?error=Orden+invalida`);
  }
  const parsed = parseReactivateInput(formData);
  if (!parsed.ok) {
    redirect(`${returnTo}?error=${encodeURIComponent(parsed.error)}`);
  }
  const motivo = parsed.motivo;

  const actor = await getActivityActor();
  const reactivada = await prisma.$transaction((tx) => reactivarOrdenTx(tx, actor, { orderId, motivo, changedById }));
  if (reactivada.error !== null) {
    redirect(`${returnTo}?error=${encodeURIComponent(reactivada.error)}`);
  }
  const retaken = reactivada.retaken;

  revalidatePath("/admin/ordenes");
  if (retaken.size > 0) {
    revalidatePath("/admin/inventario");
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=Orden+reactivada`);
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

// Cancela un producto de una venta (nov-2026; un combo, todas sus piezas). El trabajo lo hace
// cancelarProductoTx (src/lib/sale-item-swap.server.ts); reglas en src/lib/sale-item-cancel.ts.
export async function adminCancelSaleItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const item = orderItemId
    ? await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } })
    : null;
  if (!item) redirect("/admin/ordenes?error=Producto+no+encontrado");
  const back = orderDetailPath(item.orderId);
  const motivo = parseCancelItemReason(formData.get("motivo"));
  if (!motivo.ok) redirect(`${back}?error=${encodeURIComponent(motivo.error)}`);

  const actor = await getActivityActor();
  let result: ResultadoCancelar;
  try {
    result = await prisma.$transaction((tx) =>
      cancelarProductoTx(tx, actor, { orderId: item.orderId, orderItemId, motivo: motivo.value, createdById }),
    );
  } catch (error) {
    if (error instanceof CancelItemBlockedError) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    console.error("Failed to cancel sale item:", error);
    redirect(`${back}?error=No+se+pudo+cancelar+el+producto`);
  }
  if (result.error !== null) redirect(`${back}?error=${encodeURIComponent(result.error)}`);

  const ok = [
    `${result.producto} cancelado. La venta bajó ${formatCop(result.monto)}`,
    result.aFavor > 0 ? `La clienta queda con ${formatCop(result.aFavor)} a favor` : "",
    result.proveedoras.length ? `Avísale a ${result.proveedoras.join(" y ")} en la pestaña Fabricación` : "",
  ]
    .filter(Boolean)
    .join(". ");
  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(ok)}`);
}
