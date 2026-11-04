// PDF del recibo de caja con pdf-lib (sin Chromium: sale en milisegundos dentro de la acción).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  RECIBO_DIRECCION,
  RECIBO_RAZON_SOCIAL,
  pesosRecibo,
  type EstadoPedido,
  type ReciboCajaDatos,
} from "../domain/recibo-caja";

const ESTADO_TEXTO: Record<EstadoPedido, string> = {
  FABRICACION: "En fabricación",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
};

// Las fuentes estándar solo dibujan WinAnsi (latín): lo demás (emojis, etc.) se quita.
function limpiar(texto: string): string {
  return texto.replace(/[^\x20-\x7E -ÿ]/g, "").trim() || "-";
}

// Corta un texto largo en líneas que quepan en el ancho.
function lineas(texto: string, medir: (t: string) => number, ancho: number): string[] {
  const salida: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(prueba) > ancho) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

export async function generarReciboCajaPdf(datos: ReciboCajaDatos): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo de caja ${datos.ventaCodigo}`);
  pdf.setAuthor(RECIBO_RAZON_SOCIAL);
  const page = pdf.addPage([420, 595]); // A5 vertical
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gris = rgb(0.4, 0.4, 0.4);
  const margen = 36;
  const ancho = 420 - margen * 2;
  let y = 595 - margen - 10;

  page.drawText(RECIBO_RAZON_SOCIAL, { x: margen, y, size: 20, font: negrita });
  y -= 16;
  page.drawText(RECIBO_DIRECCION, { x: margen, y, size: 10, font: normal, color: gris });
  y -= 34;
  page.drawText("Recibo de caja", { x: margen, y, size: 16, font: negrita });
  y -= 10;
  page.drawLine({ start: { x: margen, y }, end: { x: margen + ancho, y }, thickness: 1, color: gris });
  y -= 22;

  const fila = (etiqueta: string, valor: string, destacado = false) => {
    page.drawText(etiqueta, { x: margen, y, size: 10, font: normal, color: gris });
    const fuente = destacado ? negrita : normal;
    const partes = lineas(limpiar(valor), (t) => fuente.widthOfTextAtSize(t, 11), ancho - 120);
    for (const parte of partes) {
      page.drawText(parte, { x: margen + 120, y, size: 11, font: fuente });
      y -= 15;
    }
    y -= 5;
  };

  fila("Venta", datos.ventaCodigo);
  fila("Fecha", datos.fecha);
  fila("Cliente", datos.cliente.nombre);
  fila("Producto", datos.producto);
  fila("Valor abonado", pesosRecibo(datos.valorAbonado), true);
  fila("Saldo pendiente", pesosRecibo(datos.saldo), true);
  fila("Estado del pedido", ESTADO_TEXTO[datos.estadoPedido]);
  fila("Asesora", datos.asesora);

  y -= 10;
  page.drawText(`Gracias por tu compra en ${RECIBO_RAZON_SOCIAL}.`, { x: margen, y, size: 10, font: normal, color: gris });

  return pdf.save();
}
