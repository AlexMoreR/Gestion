import { POR_DEFINIR, textoColores } from "./product-parts";
import { colorLabel, type QuoteItemMeta } from "./quote-item-meta";

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
  /** Imagen con los colores elegidos ("" si no hay); tiene prioridad sobre imageUrl donde se muestre. */
  imagenColoresUrl: string;
  /** 'Tapizado: Crema · Base: Dorada' si la línea tiene partes; "" si no. */
  coloresTexto: string;
  /** Un color por entrada para la cotización del cliente; vacío = "Color por confirmar". */
  colores: ColorDeFila[];
};

/** "T12 · Crema (Sintético)" (o "Tapizado: …", "Camilla: …") con la foto de la muestra ("" si no hay). */
export type ColorDeFila = { texto: string; fotoUrl: string };

/** Colores de una línea: uno por parte, o el color único (de la carta o escrito a mano). */
function coloresDeLinea(meta: QuoteItemMeta): ColorDeFila[] {
  if (meta.partes.length > 0) {
    return meta.partes.map((p) => ({
      texto: `${p.parte}: ${p.color ? colorLabel(p) : POR_DEFINIR}`,
      fotoUrl: p.color ? clean(p.colorFotoUrl) : "",
    }));
  }
  const texto = colorLabel(meta);
  return texto ? [{ texto, fotoUrl: clean(meta.colorFotoUrl) }] : [];
}

const sinRepetir = (colores: ColorDeFila[]) =>
  colores.filter((c, i) => colores.findIndex((o) => o.texto === c.texto) === i);

/** Combo: si todas las piezas tienen el mismo color va una vez; si no, cada uno con el nombre de su pieza. */
function coloresDeCombo(piezas: { pieza: string; colores: ColorDeFila[] }[]): ColorDeFila[] {
  const todos = piezas.flatMap((p) => p.colores);
  const distintos = sinRepetir(todos);
  const mismoColor = piezas.every((p) => p.colores.map((c) => c.texto).join("|") === piezas[0].colores.map((c) => c.texto).join("|"));
  if (mismoColor) return distintos;
  return sinRepetir(
    piezas.flatMap((p) =>
      p.colores.length > 0
        ? p.colores.map((c) => ({ ...c, texto: `${p.pieza}: ${c.texto}` }))
        : [{ texto: `${p.pieza}: Color por confirmar`, fotoUrl: "" }],
    ),
  );
}

const coloresDe = (meta: QuoteItemMeta) => ({
  imagenColoresUrl: clean(meta.imagenColoresUrl),
  coloresTexto: meta.partes.length > 0 ? textoColores(meta.partes) : "",
});

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
  const piezasPorCombo = new Map<number, { pieza: string; colores: ColorDeFila[] }[]>();

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
        ...coloresDe(item.meta),
        colores: coloresDeLinea(item.meta),
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
      if (!group.coloresTexto) group.coloresTexto = coloresDe(item.meta).coloresTexto;
      piezasPorCombo.get(existingIndex)?.push({ pieza: item.product.name, colores: coloresDeLinea(item.meta) });
      continue;
    }

    const quantity = item.meta.comboQuantity > 0 ? item.meta.comboQuantity : item.quantity;
    const productName = clean(item.meta.comboName) || item.product.name;
    const imageUrl = clean(item.meta.imageUrl) || clean(item.comboImageUrl) || clean(item.product.thumbnailUrl);

    indexByCombo.set(comboKey, groups.length);
    piezasPorCombo.set(groups.length, [{ pieza: item.product.name, colores: coloresDeLinea(item.meta) }]);
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
      ...coloresDe(item.meta),
      colores: [],
    });
  }

  for (const [index, piezas] of piezasPorCombo) groups[index].colores = coloresDeCombo(piezas);

  return groups;
}
