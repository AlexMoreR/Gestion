// Casilla obligatoria de la ventana "¿Confirmas que el cliente YA RECIBIÓ el pedido?".
// La comparten la ventana (cliente) y las acciones de entrega (servidor).
export const DELIVERY_CONFIRMED_FIELD = "confirmedReceived";
export const DELIVERY_NOT_CONFIRMED_ERROR = "Falta confirmar que el cliente recibió";

export function isDeliveryConfirmed(formData: FormData): boolean {
  return formData.get(DELIVERY_CONFIRMED_FIELD) === "on";
}
