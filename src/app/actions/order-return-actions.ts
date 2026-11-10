"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { parseAllowedTransitions } from "@/lib/order-dispatch";
import {
  efectoDeRegistrar,
  estaAbierta,
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

  // Evidencias: primero se validan todas por sus bytes y luego se guardan, antes de la transacción.
  // shortcut: si la transacción falla quedan archivos sin uso en el disco (no se ven ni afectan datos); limpiar si molesta.
  const uploads = formData.getAll("returnFiles").filter(hasUploadedFile);
  if (uploads.length > MAX_RETURN_FILES) fail(returnTo, `Máximo ${MAX_RETURN_FILES} archivos por devolución.`);
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
