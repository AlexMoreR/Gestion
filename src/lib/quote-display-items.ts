import type { QuoteItemMeta } from "./quote-item-meta";
import { textoColores } from "./product-parts";

type QuoteDisplayProduct = {
  name: string;
  code: string | null;
  thumbnailUrl: string | null;
  description: string | null;
};

export type QuoteDisplayItemInput = {
  id: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  product: QuoteDisplayProduct;
  meta: QuoteItemMeta;
  comboImageUrl?: string | null;
};

export type QuoteDisplayItem = {
  key: string;
  quantity: number;
  productName: string;
  productCode: string | null;
  description: string;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string;
  imageAlt: string;
  observation: string;
  /** Imagen con los colores elegidos (dirección directa, sin versiones reducidas). Vacía = no hay. */
  imagenColoresUrl: string;
  /** 'Tapizado: Crema · Base: Dorada'. Vacío = la línea no tiene partes de color. */
  coloresTexto: string;
};

const coloresDe = (meta: QuoteItemMeta) => (meta.partes.length > 0 ? textoColores(meta.partes) : "");

function toNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function groupQuoteDisplayItems(items: QuoteDisplayItemInput[]): QuoteDisplayItem[] {
  const groups: QuoteDisplayItem[] = [];
  const indexByCombo = new Map<string, number>();

  for (const item of items) {
    const comboKey = clean(item.meta.comboKey);
    const lineTotal = toNumber(item.lineTotal);

    if (!comboKey) {
      groups.push({
        key: item.id,
        quantity: item.quantity,
        productName: item.product.name,
        productCode: clean(item.product.code) || null,
        description: clean(item.meta.description),
        unitPrice: toNumber(item.unitPrice),
        lineTotal,
        imageUrl: clean(item.meta.imageUrl) || clean(item.product.thumbnailUrl),
        imageAlt: item.product.name,
        observation: clean(item.product.description),
        imagenColoresUrl: clean(item.meta.imagenColoresUrl),
        coloresTexto: coloresDe(item.meta),
      });
      continue;
    }

    const existingIndex = indexByCombo.get(comboKey);
    if (existingIndex !== undefined) {
      const group = groups[existingIndex];
      group.lineTotal = roundMoney(group.lineTotal + lineTotal);
      group.unitPrice = group.quantity > 0 ? roundMoney(group.lineTotal / group.quantity) : group.lineTotal;
      if (!group.description) group.description = clean(item.meta.description);
      if (!group.imageUrl) {
        group.imageUrl = clean(item.meta.imageUrl) || clean(item.comboImageUrl) || clean(item.product.thumbnailUrl);
      }
      if (!group.observation) group.observation = clean(item.meta.description) || clean(item.product.description);
      if (!group.productCode) group.productCode = clean(item.meta.comboCode) || null;
      if (!group.imagenColoresUrl) group.imagenColoresUrl = clean(item.meta.imagenColoresUrl);
      if (!group.coloresTexto) group.coloresTexto = coloresDe(item.meta);
      continue;
    }

    const quantity = item.meta.comboQuantity > 0 ? item.meta.comboQuantity : item.quantity;
    const productName = clean(item.meta.comboName) || item.product.name;
    const imageUrl = clean(item.meta.imageUrl) || clean(item.comboImageUrl) || clean(item.product.thumbnailUrl);

    indexByCombo.set(comboKey, groups.length);
    groups.push({
      key: `combo:${comboKey}`,
      quantity,
      productName,
      productCode: clean(item.meta.comboCode) || null,
      description: clean(item.meta.description),
      unitPrice: quantity > 0 ? roundMoney(lineTotal / quantity) : lineTotal,
      lineTotal,
      imageUrl,
      imageAlt: productName,
      observation: clean(item.meta.description) || clean(item.product.description),
      imagenColoresUrl: clean(item.meta.imagenColoresUrl),
      coloresTexto: coloresDe(item.meta),
    });
  }

  return groups;
}
