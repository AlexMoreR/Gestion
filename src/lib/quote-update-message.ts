// Mensaje a la clienta después de editar una cotización con venta (nov-2026). Gestión no le escribe sola:
// la vendedora abre WhatsApp con este texto ya escrito y lo manda con un toque.
import { displayCode } from "./code-display";
import { whatsAppDigits } from "./order-delivery-info";

const cop = (valor: number) => `$${Math.round(valor).toLocaleString("es-CO")}`;

export function mensajeCotizacionActualizada(input: {
  code: string;
  total: number;
  abonado: number;
  linkCotizacion: string;
  linkFactura: string | null;
}): string {
  const saldo = Math.round((input.total - input.abonado) * 100) / 100;
  const lineas = [
    `Hola, te comparto tu cotización ${displayCode(input.code)} actualizada.`,
    `Nuevo total: ${cop(input.total)}`,
    `Abonado: ${cop(input.abonado)}`,
    saldo >= 0 ? `Saldo pendiente: ${cop(saldo)}` : `Saldo a tu favor: ${cop(-saldo)}`,
    `Cotización: ${input.linkCotizacion}`,
  ];
  if (input.linkFactura) lineas.push(`Factura (ahí descargas el PDF): ${input.linkFactura}`);
  return lineas.join("\n");
}

/** Enlace wa.me con el teléfono de la clienta; sin teléfono, WhatsApp pide escoger el chat. */
export function enlaceWhatsAppClienta(telefono: string | null | undefined, mensaje: string): string {
  return `https://wa.me/${whatsAppDigits(telefono)}?text=${encodeURIComponent(mensaje)}`;
}
