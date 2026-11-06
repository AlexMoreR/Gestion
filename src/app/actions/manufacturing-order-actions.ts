"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { snapshotForLog } from "@/lib/activity-log-snapshot";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { displayCode } from "@/lib/code-display";
import { colombiaDateTimeInput, parseColombiaDateTime } from "@/lib/colombia-time";
import { resumenCambioFechaOf } from "@/lib/delivery-tracking";
import { validarFotosEmbalaje, type EmbalajeTipo } from "@/lib/embalaje-fotos";
import { prisma } from "@/lib/prisma";
import { hasUploadedFile, saveShipmentPhoto } from "@/lib/upload-photo";

function getReturnTo(formData: FormData): string {
  const raw = String(formData.get("returnTo") ?? "").trim().split("?")[0];
  return raw.startsWith("/admin/ordenes") ? raw : "/admin/ordenes";
}

function redirectWith(returnTo: string, key: "ok" | "error", message: string): never {
  redirect(`${returnTo}?${new URLSearchParams({ [key]: message }).toString()}`);
}

// Guarda fecha estimada (obligatoria), fecha real (opcional), direccion de despacho y notas de una OF.
export async function adminUpdateManufacturingOrderAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))) {
    redirect("/unauthorized");
  }

  const returnTo = getReturnTo(formData);
  const id = String(formData.get("manufacturingOrderId") ?? "").trim();
  if (!id) {
    redirectWith(returnTo, "error", "Orden de fabricación inválida");
  }

  const estimadaRaw = String(formData.get("estimatedDeliveryAt") ?? "").trim();
  const estimatedDeliveryAt = parseColombiaDateTime(estimadaRaw);
  if (!estimatedDeliveryAt) {
    redirectWith(returnTo, "error", "Escribe la fecha y hora estimada de entrega");
  }
  // Día del texto del campo (no colombiaDayKey: las 7:00 p. m. son medianoche UTC del día siguiente).
  // /fabricacion/<token> y /of/<código> siguen leyendo deliveryDate.
  const deliveryDate = new Date(`${estimadaRaw.slice(0, 10)}T00:00:00.000Z`);

  const realRaw = String(formData.get("receivedAt") ?? "").trim();
  const realNueva = realRaw ? parseColombiaDateTime(realRaw) : null;
  if (realRaw && !realNueva) {
    redirectWith(returnTo, "error", "Fecha real inválida");
  }
  if (realNueva && realNueva.getTime() > Date.now()) {
    redirectWith(returnTo, "error", "La fecha real no puede ser en el futuro");
  }

  const deliveryAddress = String(formData.get("deliveryAddress") ?? "").trim().slice(0, 300) || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  const LOG_FIELDS = ["deliveryDate", "estimatedDeliveryAt", "receivedAt", "deliveryAddress", "notes"] as const;
  type Log = {
    code: string;
    orderId: string;
    before: ReturnType<typeof snapshotForLog>;
    after: ReturnType<typeof snapshotForLog>;
    summary: string;
  };
  let log: Log | null = null;
  try {
    const before = await prisma.manufacturingOrder.findUnique({
      where: { id },
      select: {
        code: true,
        orderId: true,
        deliveryDate: true,
        estimatedDeliveryAt: true,
        receivedAt: true,
        deliveryAddress: true,
        notes: true,
      },
    });
    if (before) {
      // El campo no tiene segundos: si el texto es el mismo, se conserva el valor guardado (sin cambio falso).
      const realSinCambio = (before.receivedAt ? colombiaDateTimeInput(before.receivedAt) : "") === realRaw;
      const receivedAt = realSinCambio ? before.receivedAt : realNueva;
      const estimadaCambio = before.estimatedDeliveryAt?.getTime() !== estimatedDeliveryAt.getTime();
      const data = { deliveryDate, estimatedDeliveryAt, receivedAt, deliveryAddress, notes };
      await prisma.manufacturingOrder.update({ where: { id }, data });
      const code = displayCode(before.code);
      log = {
        code: before.code,
        orderId: before.orderId,
        before: snapshotForLog(before, LOG_FIELDS),
        after: snapshotForLog(data, LOG_FIELDS),
        summary:
          estimadaCambio || !realSinCambio
            ? resumenCambioFechaOf(code, {
                estimada: estimadaCambio ? { antes: before.estimatedDeliveryAt, despues: estimatedDeliveryAt } : undefined,
                real: realSinCambio ? undefined : { antes: before.receivedAt, despues: receivedAt },
              })
            : `Editó la orden de fabricación ${before.code}`,
      };
    }
  } catch {
    log = null;
  }

  if (!log) {
    redirectWith(returnTo, "error", "No se pudo guardar la orden de fabricación");
  }

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: log.orderId,
    entityCode: log.code,
    summary: log.summary,
    before: log.before,
    after: log.after,
  });

  revalidatePath(returnTo);
  redirectWith(returnTo, "ok", "Orden de fabricación actualizada");
}

// "Marcar recibido": la fecha real de la OF es ahora. Solo si aún no tenía (para corregirla, se edita).
export async function adminMarkManufacturingReceivedAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))) {
    redirect("/unauthorized");
  }

  const returnTo = getReturnTo(formData);
  const id = String(formData.get("manufacturingOrderId") ?? "").trim();
  const of = id
    ? await prisma.manufacturingOrder.findUnique({ where: { id }, select: { code: true, orderId: true } })
    : null;
  if (!of) {
    redirectWith(returnTo, "error", "Orden de fabricación inválida");
  }

  const receivedAt = new Date();
  // receivedAt: null en el where: dos toques a la vez la marcan una sola vez.
  const { count } = await prisma.manufacturingOrder.updateMany({ where: { id, receivedAt: null }, data: { receivedAt } });
  if (count === 0) {
    redirectWith(returnTo, "error", "Esta orden de fabricación ya estaba marcada como recibida");
  }

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: of.orderId,
    entityCode: of.code,
    summary: resumenCambioFechaOf(displayCode(of.code), { real: { antes: null, despues: receivedAt } }),
    before: { receivedAt: null },
    after: { receivedAt: receivedAt.toISOString() },
  });

  revalidatePath(returnTo);
  redirectWith(returnTo, "ok", "Orden de fabricación marcada como recibida");
}

// "Ya lo vi" de la proveedora en su OF pública (/fabricacion/<token>): sin sesión, el enlace secreto es el
// permiso. Solo marca el aviso si es de la OF de ese enlace y aún no estaba visto; nada más cambia.
export async function markColorNoticeSeenAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const avisoId = String(formData.get("avisoId") ?? "").trim();
  if (!token || !avisoId || token.length > 200 || avisoId.length > 100) return;

  const aviso = await prisma.avisoColorOF.findFirst({
    where: { id: avisoId, vistoEn: null, manufacturingOrder: { shareToken: token } },
    select: {
      id: true,
      producto: true,
      colorViejo: true,
      colorNuevo: true,
      manufacturingOrder: {
        select: { code: true, orderId: true, supplier: { select: { name: true, displayName: true } } },
      },
    },
  });
  if (aviso) {
    const of = aviso.manufacturingOrder;
    const vistoEn = new Date();
    await prisma.$transaction(async (tx) => {
      // vistoEn: null en el where: si dos toques llegan a la vez, solo uno lo marca y lo anota.
      const { count } = await tx.avisoColorOF.updateMany({ where: { id: aviso.id, vistoEn: null }, data: { vistoEn } });
      if (count === 0) return;
      await tx.activityLog.create({
        data: {
          actorId: null,
          actorName: `${of.supplier.displayName || of.supplier.name} (proveedora, enlace de la OF)`,
          action: "UPDATE",
          entityType: "ORDER",
          entityId: of.orderId,
          entityCode: of.code,
          summary: `La proveedora vio el cambio de color de ${aviso.producto}: ${aviso.colorViejo} → ${aviso.colorNuevo}`.slice(0, 500),
          after: { avisoColorOFId: aviso.id, vistoEn: vistoEn.toISOString() },
          origin: "PANTALLA",
        },
      });
    });
    revalidatePath(`/admin/ordenes/${of.orderId}`);
    revalidatePath(`/fabricacion/${token}`);
  }
}

// "Listo para despacho" de la proveedora en su OF pública (/fabricacion/<token>): sin sesión, el enlace
// secreto es el permiso. Sube las fotos del embalaje de un producto de esa OF (sin despacho todavía),
// para que en Magilus no se las vuelvan a pedir al despachar. No cambia estados ni dinero ni avisa a nadie.
export async function markReadyForDispatchAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  if (!token || token.length > 200) redirect("/");
  const returnTo = `/fabricacion/${encodeURIComponent(token)}`;

  const of = await prisma.manufacturingOrder.findUnique({
    where: { shareToken: token },
    select: { code: true, orderId: true, supplierId: true, supplier: { select: { name: true, displayName: true } } },
  });
  if (!of) redirectWith(returnTo, "error", "Este enlace no es válido");
  // Mismo filtro con que la página arma la lista de productos de la OF.
  const item =
    orderItemId && orderItemId.length <= 100
      ? await prisma.orderItem.findFirst({
          where: { id: orderItemId, orderId: of.orderId, confirmedSupplierId: of.supplierId, fulfillmentMode: { not: "STOCK" } },
          select: { id: true, product: { select: { name: true } } },
        })
      : null;
  if (!item) redirectWith(returnTo, "error", "Este producto no es de esta orden");

  const archivos: { tipo: EmbalajeTipo; file: File }[] = [];
  const abierto = formData.get("embalajeAbierto");
  if (hasUploadedFile(abierto)) archivos.push({ tipo: "ABIERTO", file: abierto });
  const cerrado = formData.get("embalajeCerrado");
  if (hasUploadedFile(cerrado)) archivos.push({ tipo: "CERRADO", file: cerrado });
  for (const extra of formData.getAll("embalajeExtra")) {
    if (hasUploadedFile(extra)) archivos.push({ tipo: "EXTRA", file: extra });
  }
  const nuevas = archivos.map((archivo) => archivo.tipo);

  // Despachado = está en un despacho que no está cancelado ni devuelto (criterio de la pantalla de la orden).
  const revisar = async (db: Pick<typeof prisma, "dispatchItem" | "embalajeFoto">): Promise<string | null> => {
    const despachos = await db.dispatchItem.count({
      where: { orderItemId: item.id, dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } } },
    });
    if (despachos > 0) return "Este producto ya fue despachado";
    if (nuevas.length === 0) return "Elige al menos una foto";
    const guardadas = await db.embalajeFoto.findMany({
      where: { orderItemId: item.id, dispatchId: null },
      select: { tipo: true },
    });
    return validarFotosEmbalaje({ existentes: guardadas.map((foto) => foto.tipo), nuevas });
  };

  // Antes de guardar archivos en disco, para no dejar fotos sueltas si ya se sabe que no pasa.
  const errorAntes = await revisar(prisma);
  if (errorAntes) redirectWith(returnTo, "error", errorAntes);

  const fotos: { tipo: EmbalajeTipo; url: string }[] = [];
  let photoError: string | null = null;
  try {
    for (const archivo of archivos) {
      const { url } = await saveShipmentPhoto(archivo.file);
      fotos.push({ tipo: archivo.tipo, url });
    }
  } catch (error) {
    photoError = error instanceof Error ? error.message : "No se pudo guardar la foto del embalaje.";
  }
  if (photoError) redirectWith(returnTo, "error", photoError);

  const proveedora = of.supplier.displayName || of.supplier.name;
  const errorTx = await prisma.$transaction(async (tx) => {
    // Candado sobre el producto: dos envíos a la vez no pasan de 5 fotos ni entran tras despachar.
    await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${item.id} FOR UPDATE`;
    const error = await revisar(tx);
    if (error) return error;
    await tx.embalajeFoto.createMany({
      data: fotos.map((foto) => ({
        orderItemId: item.id,
        dispatchId: null,
        tipo: foto.tipo,
        url: foto.url,
        subidoPorUserId: null,
        subidoPorTexto: `Proveedora ${proveedora}`.slice(0, 200),
      })),
    });
    await tx.activityLog.create({
      data: {
        actorId: null,
        actorName: `${proveedora} (proveedora, enlace de la OF)`,
        action: "UPDATE",
        entityType: "ORDER",
        entityId: of.orderId,
        entityCode: of.code,
        summary: `Proveedora subió fotos del embalaje: ${item.product.name}`.slice(0, 500),
        after: { orderItemId: item.id, fotos: fotos.map((foto) => ({ tipo: foto.tipo, url: foto.url })) },
        origin: "PANTALLA",
      },
    });
    return null;
  });
  if (errorTx) redirectWith(returnTo, "error", errorTx);

  revalidatePath(`/admin/ordenes/${of.orderId}`);
  revalidatePath(returnTo);
  redirectWith(returnTo, "ok", "Fotos del embalaje enviadas");
}
