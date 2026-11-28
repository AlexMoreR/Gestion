"use server";

// Venta anulada: «Pasar a inventario» un producto de Fabricación y «Registrar devolución de dinero» a la clienta.
// Mueven inventario y el saldo de una cuenta: solo dueño o administrador (rol ADMIN con permiso de Órdenes).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { MOTIVO_ANULACION_ERROR, MOTIVO_ANULACION_MIN } from "@/lib/anulaciones";
import { displayCode } from "@/lib/code-display";
import { MOTIVO_RETROACTIVO_FIELD, parseMotivo } from "@/lib/cancelled-sale";
import { anularDevolucionTx, pasarAInventarioTx, registrarDevolucionTx } from "@/lib/cancelled-sale.server";
import { prisma } from "@/lib/prisma";
import { withNegativeBalanceNotice } from "@/modules/balances/application/use-cases";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";

const balances = createPrismaBalancesRepository();

async function requireOwnerAdmin(): Promise<void> {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))
  ) {
    redirect("/unauthorized");
  }
}

const texto = (formData: FormData, campo: string) => {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
};

// Solo rutas internas del panel (nada de URLs externas en el redirect).
function getReturnTo(formData: FormData): string {
  const valor = texto(formData, "returnTo");
  return valor.startsWith("/admin/") ? valor : "/admin/ordenes";
}

function volver(returnTo: string, clave: "ok" | "error", mensaje: string): never {
  redirect(`${returnTo}?${new URLSearchParams({ [clave]: mensaje })}`);
}

function refrescar(orderId: string | null) {
  for (const ruta of ["/admin/ordenes", "/admin/inventario", "/admin/balances", "/admin/ventas"]) revalidatePath(ruta);
  if (orderId) revalidatePath(`/admin/ordenes/${orderId}`);
}

export async function adminPassCancelledItemToStockAction(formData: FormData): Promise<void> {
  await requireOwnerAdmin();
  const returnTo = getReturnTo(formData);
  const motivo = parseMotivo(formData.get("motivo"));
  if (!motivo.ok) volver(returnTo, "error", motivo.error);
  const orderItemId = texto(formData, "orderItemId");
  if (!orderItemId) volver(returnTo, "error", "Producto no encontrado.");
  const actor = await getActivityActor();

  let hecho: Awaited<ReturnType<typeof pasarAInventarioTx>>;
  try {
    hecho = await prisma.$transaction(async (tx) => {
      const paso = await pasarAInventarioTx(tx, { orderItemId, motivo: motivo.value }, actor);
      if ("error" in paso) return paso;
      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "INVENTORY",
        entityId: paso.orderId,
        entityCode: paso.orderCode,
        summary: paso.text.slice(0, 500),
        after: { venta: paso.saleCode, piezas: paso.piezas },
      });
      return paso;
    });
  } catch (error) {
    console.error("Failed to pass cancelled item to stock:", error);
    volver(returnTo, "error", "No se pudo pasar a inventario.");
  }
  if ("error" in hecho) volver(returnTo, "error", hecho.error);
  refrescar(hecho.orderId);
  volver(returnTo, "ok", `${hecho.producto} quedó en inventario. La deuda con la proveedora no cambió.`);
}

export async function adminRegisterSaleRefundAction(formData: FormData): Promise<void> {
  await requireOwnerAdmin();
  const returnTo = getReturnTo(formData);
  const saleId = texto(formData, "saleId");
  if (!saleId) volver(returnTo, "error", "Venta no encontrada.");
  const actor = await getActivityActor();

  let hecho: Awaited<ReturnType<typeof registrarDevolucionTx>>;
  try {
    hecho = await prisma.$transaction(async (tx) => {
      const devolucion = await registrarDevolucionTx(
        tx,
        {
          saleId,
          accountId: formData.get("accountId"),
          monto: formData.get("monto"),
          fecha: formData.get("fecha"),
          motivo: formData.get("motivo"),
          motivoRetroactivo: formData.get(MOTIVO_RETROACTIVO_FIELD),
        },
        actor,
      );
      if ("error" in devolucion) return devolucion;
      await logActivityTx(tx, actor, {
        action: "CREATE",
        entityType: "ACCOUNT",
        entityId: devolucion.movementId,
        entityCode: devolucion.saleCode,
        summary: devolucion.text.slice(0, 500),
        after: {
          cuenta: devolucion.accountName,
          monto: devolucion.monto,
          fecha: devolucion.fecha,
          venta: devolucion.saleCode,
          orden: devolucion.orderCode,
          faltaDevolver: devolucion.faltaDevolver,
          motivoRetroactivo: devolucion.motivoRetroactivo,
        },
      });
      return devolucion;
    });
  } catch (error) {
    console.error("Failed to register sale refund:", error);
    volver(returnTo, "error", "No se pudo registrar la devolución.");
  }
  if ("error" in hecho) volver(returnTo, "error", hecho.error);
  refrescar(hecho.orderId);
  const ok = `Devolución registrada en ${displayCode(hecho.saleCode)}. Falta devolver $${Math.round(hecho.faltaDevolver).toLocaleString("es-CO")}`;
  volver(returnTo, "ok", await withNegativeBalanceNotice(balances, ok, hecho.accountId));
}

export async function adminAnnulSaleRefundAction(formData: FormData): Promise<void> {
  await requireOwnerAdmin();
  const returnTo = getReturnTo(formData);
  const motivo = texto(formData, "motivo");
  if (motivo.length < MOTIVO_ANULACION_MIN) volver(returnTo, "error", MOTIVO_ANULACION_ERROR);
  const movementId = texto(formData, "movementId");
  const actor = await getActivityActor();

  let hecho: Awaited<ReturnType<typeof anularDevolucionTx>>;
  try {
    hecho = await prisma.$transaction((tx) => anularDevolucionTx(tx, { movementId, motivo }, actor));
  } catch (error) {
    console.error("Failed to annul sale refund:", error);
    volver(returnTo, "error", "No se pudo anular la devolución.");
  }
  if ("error" in hecho) volver(returnTo, "error", hecho.error);
  refrescar(hecho.orderId);
  volver(returnTo, "ok", "Devolución anulada.");
}
