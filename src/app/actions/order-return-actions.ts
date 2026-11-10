"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { parseAllowedTransitions } from "@/lib/order-dispatch";
import {
  ANNUL_REASON_MAX,
  ANNUL_REASON_MIN,
  cambiosDeDevolucion,
  efectoDeAnular,
  efectoDeRegistrar,
  estaAbierta,
  parseOrderReturnEdit,
  parseOrderReturnInput,
  returnLocationLabel,
  returnNextStepLabel,
  returnReasonLabel,
  type DispatchStatusKey,
  type ReturnLine,
} from "@/lib/order-return";
import { prisma } from "@/lib/prisma";
import { hasUploadedFile, saveReturnEvidence, validateReturnEvidence } from "@/lib/upload-photo";
import { syncShipmentFromDispatch } from "@/modules/guias/infrastructure/shipments-repository";

// Tope de archivos por devolución: el servidor acepta 16 MB por envío en total.
const MAX_RETURN_FILES = 6;
const NO_DISPATCH = "SIN_DESPACHO";

// Error con texto para la persona (lo demás se muestra como "No se pudo registrar la devolución").
class ReturnError extends Error {}

// Mismo permiso de Despachos y Órdenes (requireAdminSession de dispatch-actions.ts).
async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["dispatches", "orders"]))) {
    redirect("/unauthorized");
  }
  return session.user.id;
}

function fail(returnTo: string, message: string): never {
  redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
}

// Evidencias: primero se validan todas por sus bytes y luego se guardan, antes de la transacción.
// shortcut: si la transacción falla quedan archivos sin uso en el disco (no se ven ni afectan datos); limpiar si molesta.
async function saveEvidence(formData: FormData, returnTo: string): Promise<{ url: string; name: string }[]> {
  const uploads = formData.getAll("returnFiles").filter(hasUploadedFile);
  if (uploads.length > MAX_RETURN_FILES) fail(returnTo, `Máximo ${MAX_RETURN_FILES} archivos por envío.`);
  const files: { url: string; name: string }[] = [];
  try {
    const checked = await Promise.all(uploads.map((file) => validateReturnEvidence(file)));
    for (const [index, evidence] of checked.entries()) {
      const saved = await saveReturnEvidence(evidence);
      files.push({ url: saved.url, name: (uploads[index].name || `archivo-${index + 1}`).slice(0, 120) });
    }
  } catch (error) {
    fail(returnTo, error instanceof Error ? error.message : "No se pudo guardar un archivo.");
  }
  return files;
}

type OrderForReturn = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function loadOrder(db: Pick<typeof prisma, "order">, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      items: { select: { id: true, quantity: true, product: { select: { name: true } } } },
      dispatches: {
        select: {
          id: true,
          code: true,
          status: true,
          items: { select: { orderItemId: true, quantity: true } },
        },
      },
      returns: {
        select: { dispatchId: true, closedAt: true, annulledAt: true, items: { select: { orderItemId: true, quantity: true } } },
      },
    },
  });
}

// Qué salió, qué se devolvió antes y qué efecto tiene: misma cuenta fuera y dentro de la transacción.
function planReturn(order: OrderForReturn, dispatchId: string | null, nuevas: ReturnLine[]) {
  if (order.type !== "SALE") throw new ReturnError("Solo se registran devoluciones de órdenes de venta.");
  if (order.status === "CANCELLED") throw new ReturnError("La orden está cancelada.");
  const dispatch = dispatchId ? order.dispatches.find((d) => d.id === dispatchId) ?? null : null;
  if (dispatchId && !dispatch) throw new ReturnError("Ese despacho no es de esta orden.");
  if (!dispatch) {
    // Sin despacho: solo una orden que ya salió y sin despachos vivos (no se esquiva el rechazo de efectoDeRegistrar).
    const vivos = order.dispatches.some((d) => d.status !== "CANCELLED" && d.status !== "RETURNED");
    if ((order.status !== "DISPATCHED" && order.status !== "COMPLETED") || vivos) {
      throw new ReturnError("Elige el despacho de la devolución.");
    }
  }
  const salieron: ReturnLine[] =
    dispatch && dispatch.items.length > 0
      ? dispatch.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity }))
      : order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));
  const devueltasAntes = order.returns
    .filter((r) => estaAbierta(r) && r.dispatchId === (dispatch?.id ?? null))
    .flatMap((r) => r.items);
  const status = (dispatch?.status ?? null) as DispatchStatusKey | null;
  const result = efectoDeRegistrar({ dispatchStatus: status, salieron, devueltasAntes, nuevas });
  if (!result.ok) throw new ReturnError(result.error);
  // Un despacho viejo sin productos ligados no tiene línea que marcar: queda solo el registro.
  const efecto =
    result.efecto.tipo === "MARCAR_NO_ENTREGADAS" && dispatch?.items.length === 0 ? { tipo: "SOLO_REGISTRO" as const } : result.efecto;
  if (efecto.tipo === "PASAR_A_DEVUELTO" && !parseAllowedTransitions(status ?? "").includes("RETURNED")) {
    throw new ReturnError("Ese despacho no puede pasar a Devuelto.");
  }
  return { dispatch, status, efecto };
}

// «Registrar devolución» del detalle de la orden. Nunca crea fletes, cargos, abonos ni movimientos de inventario,
// y la orden no cambia de estado. Efecto según efectoDeRegistrar (src/lib/order-return.ts).
export async function adminRegisterOrderReturnAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const returnTo = orderId ? `/admin/ordenes/${orderId}` : "/admin/ordenes";
  if (!orderId) fail(returnTo, "Orden inválida");

  const parsed = parseOrderReturnInput(formData);
  if (!parsed.ok) fail(returnTo, parsed.error);
  const input = parsed.value;
  const dispatchRaw = String(formData.get("returnDispatchId") ?? "").trim();
  if (!dispatchRaw) fail(returnTo, "Elige el despacho de la devolución.");
  const dispatchId = dispatchRaw === NO_DISPATCH ? null : dispatchRaw;

  const order = await loadOrder(prisma, orderId);
  if (!order) fail(returnTo, "Orden no encontrada");
  let plan: ReturnType<typeof planReturn>;
  try {
    plan = planReturn(order, dispatchId, input.items);
  } catch (error) {
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo registrar la devolución");
  }

  const carrier = input.carrierSupplierId
    ? await prisma.supplier.findUnique({ where: { id: input.carrierSupplierId }, select: { id: true, name: true } })
    : null;
  if (input.carrierSupplierId && !carrier) fail(returnTo, "La transportadora no existe.");

  const files = await saveEvidence(formData, returnTo);

  const actor = await getActivityActor();
  const actorName = actor.name || actor.email || "Sin nombre";
  const productNames = new Map(order.items.map((i) => [i.id, i.product.name]));
  const productsText = input.items.map((i) => `${productNames.get(i.orderItemId) ?? "Producto"} ×${i.quantity}`).join(", ");
  const motive = input.reason === "OTRO" && input.reasonText ? `Otro: ${input.reasonText}` : returnReasonLabel(input.reason);

  let efectoFinal: ReturnType<typeof planReturn>["efecto"];
  try {
    efectoFinal = await prisma.$transaction(async (tx) => {
      // Candado sobre la orden: un doble clic espera y vuelve a validar con lo ya registrado.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const fresh = await loadOrder(tx, orderId);
      if (!fresh) throw new ReturnError("Orden no encontrada");
      const again = planReturn(fresh, dispatchId, input.items);
      if (again.status !== plan.status) throw new ReturnError("El despacho cambió mientras registrabas. Recarga e intenta de nuevo.");

      if (again.efecto.tipo === "PASAR_A_DEVUELTO" && again.dispatch) {
        const moved = await tx.dispatch.updateMany({
          where: { id: again.dispatch.id, status: "SHIPPED" },
          data: { status: "RETURNED" },
        });
        if (moved.count === 0) throw new ReturnError("El despacho cambió mientras registrabas. Recarga e intenta de nuevo.");
      }
      if (again.efecto.tipo === "MARCAR_NO_ENTREGADAS" && again.dispatch) {
        for (const orderItemId of again.efecto.orderItemIds) {
          // Una línea ya reversada no crea otra reversa.
          const marked = await tx.dispatchItem.updateMany({
            where: { dispatchId: again.dispatch.id, orderItemId, deliveryReversedAt: null },
            data: { deliveryReversedAt: new Date() },
          });
          if (marked.count === 0) continue;
          await tx.orderItemReversal.create({
            data: {
              orderId,
              orderItemId,
              dispatchId: again.dispatch.id,
              fromState: "ENTREGADO",
              toState: "DESPACHADO",
              reason: "RECHAZADO",
              comment: `Devolución registrada: ${motive}`.slice(0, 500),
              createdById: userId,
            },
          });
        }
      }

      const created = await tx.orderReturn.create({
        data: {
          orderId,
          dispatchId: again.dispatch?.id ?? null,
          returnDate: input.returnDate,
          dispatchStatusBefore: again.status,
          carrierSupplierId: carrier?.id ?? null,
          carrierName: input.carrierName,
          reason: input.reason,
          reasonText: input.reasonText,
          comment: input.comment,
          location: input.location,
          nextStep: input.nextStep,
          returnFreight: input.returnFreight,
          createdById: userId,
          items: { create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
          files: { create: files.map((f) => ({ url: f.url, name: f.name, uploadedById: userId })) },
        },
        select: { id: true },
      });

      const efectoTexto =
        again.efecto.tipo === "PASAR_A_DEVUELTO"
          ? "despacho a Devuelto"
          : again.efecto.tipo === "MARCAR_NO_ENTREGADAS"
            ? "productos como no entregados"
            : "solo el registro";
      await logActivityTx(tx, actor, {
        action: "CREATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: fresh.code,
        summary: `${actorName} registró una devolución de ${displayCode(fresh.code)}${again.dispatch ? ` (${displayCode(again.dispatch.code)})` : ""}: ${motive} · ${productsText} · ${efectoTexto}`,
        before: again.dispatch ? { despacho: again.dispatch.code, estadoDespacho: again.status } : null,
        after: {
          devolucion: created.id,
          despacho: again.dispatch?.code ?? null,
          motivo: input.reason,
          motivoTexto: input.reasonText,
          comentario: input.comment,
          productos: productsText,
          dondeEsta: returnLocationLabel(input.location),
          queSigue: returnNextStepLabel(input.nextStep),
          fleteVuelta: input.returnFreight,
          archivos: files.length,
          efecto: again.efecto.tipo,
          registradoPor: actorName,
        },
      });
      return again.efecto;
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Failed to register order return:", error);
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo registrar la devolución");
  }

  if (efectoFinal.tipo === "PASAR_A_DEVUELTO" && plan.dispatch) {
    await syncShipmentFromDispatch(plan.dispatch.id, "RETURNED", userId);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent("Devolución registrada")}`);
}

// --- Vida de una devolución ya registrada: editar, anular, cerrar y aviso a la asesora (parte 3) ---

// Lee orderId y returnId del formulario; la devolución debe ser de esa orden.
async function returnFromForm(formData: FormData) {
  const userId = await requireAdminSession();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const returnId = String(formData.get("returnId") ?? "").trim();
  const returnTo = orderId ? `/admin/ordenes/${orderId}` : "/admin/ordenes";
  if (!orderId || !returnId) fail(returnTo, "Devolución inválida");
  const found = await prisma.orderReturn.findUnique({ where: { id: returnId }, select: { orderId: true } });
  if (!found || found.orderId !== orderId) fail(returnTo, "Devolución no encontrada");
  return { userId, orderId, returnId, returnTo };
}

// Dentro de la transacción: candado sobre la orden y la devolución fresca, que debe seguir abierta.
// Anular pasa checkOpen=false: efectoDeAnular da su propio mensaje.
async function lockOpenReturn(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  orderId: string,
  returnId: string,
  checkOpen = true,
) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const current = await tx.orderReturn.findUnique({
    where: { id: returnId },
    include: {
      order: { select: { code: true } },
      dispatch: { select: { id: true, code: true, status: true } },
      items: { select: { orderItemId: true, quantity: true, orderItem: { select: { product: { select: { name: true } } } } } },
    },
  });
  if (!current) throw new ReturnError("Devolución no encontrada");
  if (checkOpen && current.annulledAt) throw new ReturnError("Esta devolución está anulada.");
  if (checkOpen && current.closedAt) throw new ReturnError("Esta devolución está cerrada.");
  return current;
}

function done(returnTo: string, message: string): never {
  revalidatePath("/admin/ordenes");
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=${encodeURIComponent(message)}`);
}

// «Editar»: dónde está, qué sigue, motivo, comentario, flete de vuelta y agregar evidencias. Bitácora con antes y después.
export async function adminEditOrderReturnAction(formData: FormData): Promise<void> {
  const { userId, orderId, returnId, returnTo } = await returnFromForm(formData);
  const parsed = parseOrderReturnEdit(formData);
  if (!parsed.ok) fail(returnTo, parsed.error);
  const input = parsed.value;
  const files = await saveEvidence(formData, returnTo);
  const actor = await getActivityActor();
  const actorName = actor.name || actor.email || "Sin nombre";

  let changed = false;
  try {
    changed = await prisma.$transaction(async (tx) => {
      const current = await lockOpenReturn(tx, orderId, returnId);
      const cambios = cambiosDeDevolucion(current, input);
      if (!cambios && files.length === 0) return false;
      await tx.orderReturn.update({
        where: { id: returnId },
        data: {
          ...input,
          files: { create: files.map((f) => ({ url: f.url, name: f.name, uploadedById: userId })) },
        },
      });
      const fields = Object.keys(cambios?.after ?? {});
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: current.order.code,
        summary: `${actorName} editó una devolución de ${displayCode(current.order.code)}${fields.length > 0 ? `: ${fields.join(", ")}` : ""}${files.length > 0 ? ` · ${files.length} archivo(s) nuevo(s)` : ""}`,
        before: { devolucion: returnId, ...(cambios?.before ?? {}) },
        after: { devolucion: returnId, ...(cambios?.after ?? {}), archivosNuevos: files.length, editadoPor: actorName },
      });
      return true;
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Failed to edit order return:", error);
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo actualizar la devolución");
  }
  done(returnTo, changed ? "Devolución actualizada" : "No había cambios");
}

// Una reversa la creó la devolución si salió en la misma transacción del registro (mismo autor, mismo minuto).
// shortcut: no hay columna que ligue la reversa a la devolución; si hiciera falta, agregar OrderItemReversal.returnId.
function reversaDeLaDevolucion(
  reversal: { comment: string | null; createdById: string; createdAt: Date } | null,
  devolucion: { createdById: string; createdAt: Date },
): boolean {
  return (
    reversal !== null &&
    (reversal.comment ?? "").startsWith("Devolución registrada") &&
    reversal.createdById === devolucion.createdById &&
    Math.abs(reversal.createdAt.getTime() - devolucion.createdAt.getTime()) < 60_000
  );
}

// «Anular»: la fila se conserva (annulledAt, annulReason). Efecto según efectoDeAnular (src/lib/order-return.ts).
// No toca dinero, inventario ni el estado de la orden.
export async function adminAnnulOrderReturnAction(formData: FormData): Promise<void> {
  const { userId, orderId, returnId, returnTo } = await returnFromForm(formData);
  const annulReason = String(formData.get("annulReason") ?? "").trim();
  if (annulReason.length < ANNUL_REASON_MIN) fail(returnTo, `Escribe el motivo de la anulación (mínimo ${ANNUL_REASON_MIN} letras).`);
  if (annulReason.length > ANNUL_REASON_MAX) fail(returnTo, `El motivo no puede pasar de ${ANNUL_REASON_MAX} letras.`);
  const actor = await getActivityActor();
  const actorName = actor.name || actor.email || "Sin nombre";

  let result: { efecto: string; dispatchId: string | null; sinTocar: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      const current = await lockOpenReturn(tx, orderId, returnId, false);
      const orderItemIds = current.items.map((i) => i.orderItemId);
      const dispatch = current.dispatch;
      const others = dispatch
        ? await tx.dispatch.findMany({
            where: { orderId, id: { not: dispatch.id } },
            select: { code: true, status: true, items: { select: { orderItemId: true } } },
          })
        : [];

      // Líneas de esta devolución que hoy siguen como no entregadas en su despacho entregado.
      const reversadas: { orderItemId: string; deEstaDevolucion: boolean }[] = [];
      if (dispatch?.status === "DELIVERED") {
        const marked = await tx.dispatchItem.findMany({
          where: { dispatchId: dispatch.id, orderItemId: { in: orderItemIds }, deliveryReversedAt: { not: null } },
          select: { orderItemId: true },
        });
        for (const { orderItemId } of marked) {
          const last = await tx.orderItemReversal.findFirst({
            where: { orderId, dispatchId: dispatch.id, orderItemId, fromState: "ENTREGADO" },
            orderBy: { createdAt: "desc" },
            select: { comment: true, createdById: true, createdAt: true },
          });
          reversadas.push({ orderItemId, deEstaDevolucion: reversaDeLaDevolucion(last, current) });
        }
      }

      const plan = efectoDeAnular({
        devolucion: current,
        dispatchStatus: (dispatch?.status ?? null) as DispatchStatusKey | null,
        orderItemIds,
        otrosDespachos: others.map((d) => ({ code: displayCode(d.code), status: d.status, orderItemIds: d.items.map((i) => i.orderItemId) })),
        reversadas,
      });
      if (!plan.ok) throw new ReturnError(plan.error);
      const efecto = plan.efecto;

      const annulled = await tx.orderReturn.updateMany({
        where: { id: returnId, annulledAt: null, closedAt: null },
        data: { annulledAt: new Date(), annulReason },
      });
      if (annulled.count === 0) throw new ReturnError("La devolución cambió mientras anulabas. Recarga e intenta de nuevo.");

      if (efecto.tipo === "VOLVER_A_ENVIADO" && dispatch) {
        const moved = await tx.dispatch.updateMany({ where: { id: dispatch.id, status: "RETURNED" }, data: { status: "SHIPPED" } });
        if (moved.count === 0) throw new ReturnError("El despacho cambió mientras anulabas. Recarga e intenta de nuevo.");
        // La guía Devuelta es final para syncShipmentFromDispatch: se vuelve aquí a su último estado en camino.
        const shipment = await tx.shipment.findUnique({ where: { dispatchId: dispatch.id }, select: { id: true, status: true } });
        if (shipment?.status === "RETURNED") {
          const previous = await tx.shipmentEvent.findFirst({
            where: { shipmentId: shipment.id, kind: "STATUS", status: { notIn: ["RETURNED", "CANCELLED", "DELIVERED"] } },
            orderBy: { occurredAt: "desc" },
            select: { status: true },
          });
          const status = previous?.status ?? "IN_TRANSIT";
          await tx.shipment.update({ where: { id: shipment.id }, data: { status } });
          await tx.shipmentEvent.create({
            data: {
              shipmentId: shipment.id,
              kind: "STATUS",
              status,
              visibleToClient: false,
              actor: "SYSTEM",
              actorUserId: userId,
              note: "Se anuló la devolución: vuelve a En camino",
              occurredAt: new Date(),
            },
          });
        }
      }

      const motive = `Anuló la devolución: ${annulReason}`.slice(0, 500);
      if (efecto.tipo === "LIMPIAR_ENTREGA" && dispatch) {
        for (const orderItemId of efecto.orderItemIds) {
          const cleared = await tx.dispatchItem.updateMany({
            where: { dispatchId: dispatch.id, orderItemId, deliveryReversedAt: { not: null } },
            data: { deliveryReversedAt: null },
          });
          if (cleared.count === 0) continue;
          await tx.orderItemReversal.create({
            data: {
              orderId,
              orderItemId,
              dispatchId: dispatch.id,
              fromState: "DESPACHADO",
              toState: "ENTREGADO",
              reason: "ERROR",
              comment: motive,
              createdById: userId,
            },
          });
        }
      }

      const sinTocar = efecto.tipo === "LIMPIAR_ENTREGA" ? efecto.sinTocar.length : 0;
      const efectoTexto =
        efecto.tipo === "VOLVER_A_ENVIADO"
          ? "despacho y guía vuelven a En camino"
          : efecto.tipo === "LIMPIAR_ENTREGA"
            ? `productos vuelven a Entregado${sinTocar > 0 ? ` (${sinTocar} con otra reversa, sin tocar)` : ""}`
            : "solo la anulación";
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: current.order.code,
        summary: `${actorName} anuló una devolución de ${displayCode(current.order.code)}${dispatch ? ` (${displayCode(dispatch.code)})` : ""}: ${annulReason} · ${efectoTexto}`,
        before: { devolucion: returnId, estado: "Abierta", estadoDespacho: dispatch?.status ?? null },
        after: {
          devolucion: returnId,
          estado: "Anulada",
          motivoAnulacion: annulReason,
          estadoDespacho: efecto.tipo === "VOLVER_A_ENVIADO" ? "SHIPPED" : dispatch?.status ?? null,
          efecto: efecto.tipo,
          anuladoPor: actorName,
        },
      });
      return { efecto: efecto.tipo, dispatchId: dispatch?.id ?? null, sinTocar };
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Failed to annul order return:", error);
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo anular la devolución");
  }

  revalidatePath("/admin/despachos");
  done(
    returnTo,
    result.sinTocar > 0
      ? `Devolución anulada. ${result.sinTocar} producto(s) tenían otra reversa y siguen como no entregados.`
      : "Devolución anulada",
  );
}

// «Cerrar devolución»: solo llena closedAt. La orden, el despacho y la guía no cambian.
export async function adminCloseOrderReturnAction(formData: FormData): Promise<void> {
  const { orderId, returnId, returnTo } = await returnFromForm(formData);
  const actor = await getActivityActor();
  const actorName = actor.name || actor.email || "Sin nombre";
  try {
    await prisma.$transaction(async (tx) => {
      const current = await lockOpenReturn(tx, orderId, returnId);
      await tx.orderReturn.update({ where: { id: returnId }, data: { closedAt: new Date() } });
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: current.order.code,
        summary: `${actorName} cerró una devolución de ${displayCode(current.order.code)}`,
        before: { devolucion: returnId, estado: "Abierta" },
        after: { devolucion: returnId, estado: "Cerrada", cerradoPor: actorName },
      });
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Failed to close order return:", error);
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo cerrar la devolución");
  }
  done(returnTo, "Devolución cerrada");
}

// «Ya avisé»: guarda quién le avisó a la asesora y cuándo. El aviso se manda a mano (wa.me); nada sale solo.
export async function adminMarkReturnSellerNotifiedAction(formData: FormData): Promise<void> {
  const { userId, orderId, returnId, returnTo } = await returnFromForm(formData);
  const actor = await getActivityActor();
  const actorName = actor.name || actor.email || "Sin nombre";
  try {
    await prisma.$transaction(async (tx) => {
      const current = await lockOpenReturn(tx, orderId, returnId);
      if (current.sellerNotifiedAt) throw new ReturnError("Ya se había avisado a la asesora.");
      const now = new Date();
      await tx.orderReturn.update({ where: { id: returnId }, data: { sellerNotifiedAt: now, sellerNotifiedById: userId } });
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: current.order.code,
        summary: `${actorName} avisó a la asesora de una devolución de ${displayCode(current.order.code)}`,
        before: { devolucion: returnId, asesoraAvisada: false },
        after: { devolucion: returnId, asesoraAvisada: true, avisadoPor: actorName },
      });
    });
  } catch (error) {
    if (!(error instanceof ReturnError)) console.error("Failed to mark seller notified:", error);
    fail(returnTo, error instanceof ReturnError ? error.message : "No se pudo guardar el aviso");
  }
  done(returnTo, "Aviso a la asesora guardado");
}
