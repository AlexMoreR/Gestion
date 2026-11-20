// Aviso de la OF del Combo Camillas (nov-2026, parte 2): por cada orden, por qué la OF todavía
// no se le puede mandar sola a la proveedora. Se calcula al vuelo (no se guarda); la regla es
// planAvisoOF. planOFCombo lo usa el envío por WhatsApp (parte 3, enviar-of-proveedora.ts).
import "server-only";
import { claveColorCombo, etiquetaColorCombo, fotoExactaDelColor } from "@/lib/combo-foto-color";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import {
  type AvisoOFPlan,
  COMBO_CAMILLAS_CODES,
  codigoComboDeLinea,
  planAvisoOF,
  textoAvisoOF,
} from "../domain/combo-camillas";

export type PlanOFCombo = {
  plan: AvisoOFPlan;
  texto: string | null; // textoAvisoOF (null = no hay aviso)
  foto: { fotoUrl: string } | null; // foto exacta del color
  proveedora: { id: string; name: string; phone: string | null } | null;
};

/** orderId → texto del aviso. Las órdenes sin combo o listas para enviar no aparecen. */
export async function avisosOFCombo(orderIds: string[]): Promise<Map<string, string>> {
  const avisos = new Map<string, string>();
  for (const [orderId, { texto }] of await planesOFCombo(orderIds)) {
    if (texto) avisos.set(orderId, texto);
  }
  return avisos;
}

/** Plan del aviso de la OF del combo de una orden (null = la orden no trae el combo). */
export async function planOFCombo(orderId: string): Promise<PlanOFCombo | null> {
  return (await planesOFCombo([orderId])).get(orderId) ?? null;
}

// Por orden, el plan de su primer combo con aviso (o el primero, si ninguno tiene aviso).
async function planesOFCombo(orderIds: string[]): Promise<Map<string, PlanOFCombo>> {
  const planes = new Map<string, PlanOFCombo>();
  if (orderIds.length === 0) return planes;

  const [items, combos] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { id: "asc" },
      select: {
        orderId: true,
        notes: true,
        fulfillmentMode: true,
        product: { select: { code: true } },
        confirmedSupplier: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.product.findMany({
      where: { code: { in: [...COMBO_CAMILLAS_CODES] } },
      select: { code: true, name: true, fotosColor: { select: { claveColor: true, fotoUrl: true } } },
    }),
  ]);

  // Piezas del combo agrupadas por orden y código del combo.
  const grupos = new Map<string, { orderId: string; codigo: string; items: typeof items }>();
  for (const item of items) {
    const codigo = codigoComboDeLinea({ notes: item.notes, productCode: item.product.code }, combos);
    if (!codigo) continue;
    const llave = `${item.orderId}|${codigo}`;
    const grupo = grupos.get(llave) ?? { orderId: item.orderId, codigo, items: [] };
    grupo.items.push(item);
    grupos.set(llave, grupo);
  }

  for (const grupo of grupos.values()) {
    if (planes.get(grupo.orderId)?.texto) continue;
    // La proveedora es la confirmada en las piezas de fábrica; si hay más de una, no se adivina.
    const proveedoras = new Map(
      grupo.items
        .filter((item) => item.fulfillmentMode !== "STOCK" && item.confirmedSupplier)
        .map((item) => [item.confirmedSupplier!.id, item.confirmedSupplier!]),
    );
    const proveedora = proveedoras.size === 1 ? [...proveedoras.values()][0] : null;
    const colores = grupo.items.map((item) => {
      const meta = parseQuoteItemMeta(item.notes);
      return { color: meta.color, partes: meta.partes };
    });
    const fotos = combos.find((combo) => combo.code?.trim().toUpperCase() === grupo.codigo)?.fotosColor ?? [];
    const foto = fotoExactaDelColor(fotos, claveColorCombo(colores));
    const plan = planAvisoOF({
      modos: grupo.items.map((item) => item.fulfillmentMode),
      proveedora,
      telefono: proveedora?.phone,
      foto,
      color: etiquetaColorCombo(colores[0]),
    });
    const texto = textoAvisoOF(plan);
    if (texto || !planes.has(grupo.orderId)) planes.set(grupo.orderId, { plan, texto, foto, proveedora });
  }
  return planes;
}
