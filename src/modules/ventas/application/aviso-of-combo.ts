// Aviso de la OF del Combo Camillas (nov-2026, parte 2): por cada orden, por qué la OF todavía
// no se le puede mandar sola a la proveedora. Se calcula al vuelo (no se guarda); la regla es
// planAvisoOF. Todavía no se manda nada a nadie.
import "server-only";
import { claveColorCombo, etiquetaColorCombo, fotoExactaDelColor } from "@/lib/combo-foto-color";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { COMBO_CAMILLAS_CODES, codigoComboDeLinea, planAvisoOF, textoAvisoOF } from "../domain/combo-camillas";

/** orderId → texto del aviso. Las órdenes sin combo o listas para enviar no aparecen. */
export async function avisosOFCombo(orderIds: string[]): Promise<Map<string, string>> {
  const avisos = new Map<string, string>();
  if (orderIds.length === 0) return avisos;

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
    if (avisos.has(grupo.orderId)) continue;
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
    const texto = textoAvisoOF(
      planAvisoOF({
        modos: grupo.items.map((item) => item.fulfillmentMode),
        proveedora,
        telefono: proveedora?.phone,
        foto: fotoExactaDelColor(fotos, claveColorCombo(colores)),
        color: etiquetaColorCombo(colores[0]),
      }),
    );
    if (texto) avisos.set(grupo.orderId, texto);
  }
  return avisos;
}
