// Puertos del aviso de la OF por WhatsApp sobre Prisma (nov-2026, combo camilla parte 3). Lee la OF
// (sin datos de la clienta salvo ciudad y departamento, como /fabricacion/<token>) y guarda el
// resultado en la OF y en la bitácora. No toca dinero ni estados.
import "server-only";
import { logActivityAs } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { colombiaTimeOfDay, todayInColombia } from "@/lib/colombia-time";
import { destinationCityLabel, mensajeOFProveedora, toManufacturingLine } from "@/lib/manufacturing-orders";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl, getSiteUrl } from "@/lib/site";
import { getAvisoOFConfig } from "@/lib/system-settings";
import { AVISO_PRODUCTO_CANCELADO, mensajeAvisoOF } from "@/lib/sale-item-cancel";
import { planOFCombo } from "../application/aviso-of-combo";
import { avisarCambioOFSiYaSeEnvio, type AvisoCambioPuertos, type AvisoOFPuertos } from "../application/enviar-of-proveedora";
import { dispararRecibo } from "../application/enviar-recibo-caja";
import { COMBO_CAMILLAS_CODES } from "../domain/combo-camillas";

export function prismaAvisoOFPuertos(actorId: string): AvisoOFPuertos {
  return {
    leerConfig: getAvisoOFConfig,

    async cargar(ofId) {
      const of = await prisma.manufacturingOrder.findUnique({
        where: { id: ofId },
        select: {
          code: true,
          orderId: true,
          supplierId: true,
          shareToken: true,
          notes: true,
          deliveryDate: true,
          supplier: { select: { name: true, displayName: true, phone: true } },
          order: { select: { code: true, client: { select: { city: true, department: true } } } },
        },
      });
      if (!of) return null;
      const combo = await planOFCombo(of.orderId);
      if (!combo) return null;
      // La OF tiene que ser de la proveedora del combo; si no, no se adivina.
      const plan =
        combo.plan.accion === "enviar" && combo.proveedora?.id !== of.supplierId
          ? ({ accion: "alerta", motivo: "falta_proveedora" } as const)
          : combo.plan;
      const items = await prisma.orderItem.findMany({
        where: { orderId: of.orderId, confirmedSupplierId: of.supplierId, fulfillmentMode: { not: "STOCK" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          purchaseCost: true,
          notes: true,
          product: { select: { name: true, code: true, thumbnailUrl: true, description: true } },
        },
      });
      return {
        ofCode: of.code,
        orderCode: of.order.code,
        plan,
        telefonoProveedora: of.supplier.phone,
        mensaje: mensajeOFProveedora({
          proveedora: of.supplier.displayName?.trim() || of.supplier.name,
          ofCode: of.code,
          orderCode: of.order.code,
          lineas: items.map(toManufacturingLine),
          destino: destinationCityLabel(of.order.client),
          notas: of.notes,
          entrega: of.deliveryDate,
          enlace: getSiteUrl(`/fabricacion/${of.shareToken}`),
        }),
        imagenUrl: combo.foto?.fotoUrl ? getPublicAssetUrl(combo.foto.fotoUrl) : null,
      };
    },

    async tomar(ofId) {
      const { count } = await prisma.manufacturingOrder.updateMany({
        where: { id: ofId, avisoProveedoraEstado: null },
        data: { avisoProveedoraEstado: "ENVIANDO", avisoProveedoraEn: new Date() },
      });
      return count === 1;
    },

    async marcar(ofId, estado, en, destino) {
      await prisma.manufacturingOrder.update({
        where: { id: ofId },
        data: { avisoProveedoraEstado: estado, avisoProveedoraEn: en, avisoProveedoraDestino: destino },
      });
    },

    async bitacora({ ofId, ofCode, estado, destino, en, detalle }) {
      const [actor, of] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId }, select: { id: true, name: true, email: true } }),
        prisma.manufacturingOrder.findUnique({ where: { id: ofId }, select: { orderId: true } }),
      ]);
      await logActivityAs(actor ?? { id: actorId }, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: of?.orderId ?? null,
        entityCode: ofCode,
        summary: `Aviso por WhatsApp de la ${displayCode(ofCode)}: ${estado} · a ${destino ?? "ningún número"} · ${todayInColombia(en)} ${colombiaTimeOfDay(en)} · ${detalle}`,
      });
    },
  };
}

// Parte 4: el cambio (AvisoColorOF) de una OF que ya le salió a la proveedora. Solo datos de la OF y
// del cambio: nada de la clienta.
export function prismaAvisoCambioOFPuertos(actorId: string): AvisoCambioPuertos {
  return {
    leerConfig: getAvisoOFConfig,

    async cargar(avisoId) {
      const aviso = await prisma.avisoColorOF.findUnique({
        where: { id: avisoId },
        select: {
          producto: true,
          colorViejo: true,
          colorNuevo: true,
          manufacturingOrder: {
            select: { code: true, orderId: true, shareToken: true, avisoProveedoraEstado: true, supplier: { select: { phone: true } } },
          },
        },
      });
      if (!aviso) return null;
      const of = aviso.manufacturingOrder;
      // La foto solo aplica al cambio de color del combo: la exacta del color que quedó (planOFCombo).
      let esCambioDeColor = false;
      let imagenUrl: string | null = null;
      if (aviso.colorNuevo !== AVISO_PRODUCTO_CANCELADO) {
        const combos = await prisma.product.findMany({ where: { code: { in: [...COMBO_CAMILLAS_CODES] } }, select: { name: true } });
        const nombre = aviso.producto.trim().toLowerCase();
        esCambioDeColor = combos.some((combo) => combo.name.trim().toLowerCase() === nombre);
        if (esCambioDeColor) {
          const combo = await planOFCombo(of.orderId);
          imagenUrl = combo?.foto?.fotoUrl ? getPublicAssetUrl(combo.foto.fotoUrl) : null;
        }
      }
      return {
        ofCode: of.code,
        estadoOF: of.avisoProveedoraEstado,
        telefonoProveedora: of.supplier.phone,
        mensaje: mensajeAvisoOF({ code: of.code, ...aviso, url: getSiteUrl(`/fabricacion/${of.shareToken}`) }),
        esCambioDeColor,
        imagenUrl,
      };
    },

    async tomar(avisoId) {
      const { count } = await prisma.avisoColorOF.updateMany({
        where: { id: avisoId, whatsappEstado: null },
        data: { whatsappEstado: "ENVIANDO", whatsappEn: new Date() },
      });
      return count === 1;
    },

    async marcar(avisoId, estado, en) {
      await prisma.avisoColorOF.update({ where: { id: avisoId }, data: { whatsappEstado: estado, whatsappEn: en } });
    },

    async bitacora({ avisoId, ofCode, estado, destino, en, detalle }) {
      const [actor, aviso] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId }, select: { id: true, name: true, email: true } }),
        prisma.avisoColorOF.findUnique({ where: { id: avisoId }, select: { manufacturingOrder: { select: { orderId: true } } } }),
      ]);
      await logActivityAs(actor ?? { id: actorId }, {
        action: "UPDATE",
        entityType: "ORDER",
        entityId: aviso?.manufacturingOrder.orderId ?? null,
        entityCode: ofCode,
        summary: `Aviso por WhatsApp del cambio en la ${displayCode(ofCode)}: ${estado} · a ${destino ?? "ningún número"} · ${todayInColombia(en)} ${colombiaTimeOfDay(en)} · ${detalle}`,
      });
    },
  };
}

/** Las acciones lo llaman después de guardar: cada aviso en segundo plano (nunca rompe la acción). */
export function dispararAvisosCambioOF(avisoIds: string[], actorId: string): void {
  for (const avisoId of avisoIds) {
    dispararRecibo(() => avisarCambioOFSiYaSeEnvio(avisoId, prismaAvisoCambioOFPuertos(actorId)));
  }
}
