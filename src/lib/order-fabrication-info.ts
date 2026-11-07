import { displayCode } from "./code-display";
import { imagenesDeLaLinea } from "./of-image";
import { shortColombiaDate } from "./order-delivery-info";
import { textoColores } from "./product-parts";
import { parseQuoteItemMeta } from "./quote-item-meta";
import { getPublicAssetUrl } from "./site";

// Texto "Copiar datos de fabricación" de una OF. Puro para poder probarlo.
// A propósito no recibe cliente, dirección, precios ni costos: a la proveedora solo le va lo de fabricar.

type FabricationItem = {
  id: string;
  confirmedSupplierId: string | null;
  quantity: number;
  notes: string | null;
  product: { name: string; code: string | null; thumbnailUrl: string | null; description: string | null };
};

export type FabricationCopyInput = {
  orderCode: string;
  saleCode: string | null;
  ofCode: string;
  supplierId: string;
  supplierName: string | null;
  // Solo la fecha estimada de la OF; nunca deliveryDate (la pantalla la trata como "Sin fecha").
  estimatedDeliveryAt: Date | null;
  // ManufacturingOrder.notes ("Notas para la proveedora"); nunca OrderNote, que es interna.
  ofNotes: string | null;
  items: FabricationItem[];
};

// Todo en una línea, sin espacios de sobra ("" si no hay nada).
const oneLine = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

// "" si la proveedora no tiene productos en la OF.
export function buildFabricationCopyText(input: FabricationCopyInput): string {
  const items = input.items
    .filter((item) => item.confirmedSupplierId === input.supplierId)
    .sort(
      (a, b) =>
        a.product.name.localeCompare(b.product.name, "es") ||
        (a.product.code ?? "").localeCompare(b.product.code ?? "", "es") ||
        a.id.localeCompare(b.id),
    );
  if (items.length === 0) return "";

  const codes = [input.orderCode, input.saleCode, input.ofCode].filter((code) => oneLine(code)).map((code) => displayCode(code));
  const lines = [
    `Referencia: ${codes.join(" / ")}`,
    `Proveedora: ${oneLine(input.supplierName) || "Sin dato"}`,
    `Fecha de entrega: ${input.estimatedDeliveryAt ? shortColombiaDate(input.estimatedDeliveryAt) : "Sin fecha"}`,
  ];

  for (const item of items) {
    const meta = parseQuoteItemMeta(item.notes);
    const color = meta.partes.length > 0 ? textoColores(meta.partes) : oneLine(meta.color);
    const detail = oneLine(meta.description) || oneLine(item.product.description);
    // getPublicAssetUrl("") da la raíz del sitio: sin imagen no se agrega la línea.
    const image = imagenesDeLaLinea(meta, item.product.thumbnailUrl ?? "").principal.trim();
    lines.push(
      `${item.quantity} x ${oneLine(item.product.name).toLocaleUpperCase("es")} (${oneLine(item.product.code) || "Sin dato"})`,
      `  Color: ${oneLine(color) || "Sin dato"}`,
    );
    if (detail) lines.push(`  Detalle: ${detail}`);
    if (image) lines.push(`  Imagen: ${getPublicAssetUrl(image)}`);
  }

  const notes = oneLine(input.ofNotes);
  if (notes) lines.push(`Notas de la orden: ${notes}`);
  return lines.join("\n");
}
