// Recibo de caja al CRM (nov-2026): reglas puras del contenido del recibo que Gestión manda al
// CRM al pasar una cotización a venta y en cada abono. El CRM lo reenvía por WhatsApp al cliente.
import { colombiaDayKey } from "../../../lib/colombia-time";
import { displayCode } from "../../../lib/code-display";

// Datos de Magilus en el recibo: cambiarlos solo acá.
export const RECIBO_RAZON_SOCIAL = "Magilus";
export const RECIBO_DIRECCION = "Cali - Bogotá, Colombia";

export const RECIBO_CRM_URL_POR_DEFECTO = "https://crm.magilus.com/api/gestion/recibo-de-caja";

export type ReciboCajaEstado = "ENVIADO" | "FALLIDO";
export type EstadoPedido = "FABRICACION" | "DESPACHADO" | "ENTREGADO";

/** Sin orden o en cualquier paso antes del despacho → FABRICACION. */
export function estadoPedido(orderStatus: string | null | undefined): EstadoPedido {
  if (orderStatus === "COMPLETED") return "ENTREGADO";
  if (orderStatus === "DISPATCHED") return "DESPACHADO";
  return "FABRICACION";
}

export type ReciboAbono = { id: string; amount: number; paymentDate: Date | null; createdAt: Date; isWithholding: boolean };

export type ReciboVenta = {
  code: string;
  total: number;
  clienteNombre: string;
  clienteTelefono: string;
  productos: string[];
  asesora: string;
  orderStatus: string | null;
  /** Todos los abonos de la venta (para el saldo). */
  pagos: ReciboAbono[];
};

export type ReciboCajaDatos = {
  reciboId: string;
  ventaCodigo: string;
  cliente: { nombre: string; telefono: string };
  producto: string;
  valorAbonado: number;
  saldo: number;
  estadoPedido: EstadoPedido;
  asesora: string;
  fecha: string;
};

/**
 * Un solo recibo por los abonos indicados (varias cuotas al pasar a venta → la suma, con el id del
 * primero). La retención en la fuente no es plata del cliente: no entra al recibo. Null si no queda nada.
 */
export function armarReciboCaja(venta: ReciboVenta, abonoIds: string[]): ReciboCajaDatos | null {
  const ids = new Set(abonoIds);
  const abonos = venta.pagos.filter((pago) => ids.has(pago.id) && !pago.isWithholding);
  if (abonos.length === 0) return null;
  const pagado = venta.pagos.reduce((sum, pago) => sum + pago.amount, 0);
  const ultimo = abonos[abonos.length - 1];
  return {
    reciboId: abonos[0].id,
    ventaCodigo: displayCode(venta.code),
    cliente: { nombre: venta.clienteNombre, telefono: venta.clienteTelefono },
    producto: venta.productos.join(", "),
    valorAbonado: abonos.reduce((sum, pago) => sum + pago.amount, 0),
    saldo: Math.max(venta.total - pagado, 0),
    estadoPedido: estadoPedido(venta.orderStatus),
    asesora: venta.asesora,
    fecha: colombiaDayKey(ultimo.paymentDate ?? ultimo.createdAt),
  };
}

export function nombreArchivoRecibo(datos: ReciboCajaDatos): string {
  return `recibo-de-caja-${datos.ventaCodigo}-${datos.fecha}.pdf`;
}

export function pesosRecibo(valor: number): string {
  return `$${Math.round(valor).toLocaleString("es-CO")}`;
}
