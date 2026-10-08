import { createHash } from "node:crypto";

// shareToken ESTABLE para una (cotizacion, proveedora): se deriva de forma
// determinista de ambos ids, con AUTH_SECRET (mismo patron que el informe
// mensual). Asi, si el pedido se borra y se vuelve a crear desde la MISMA
// cotizacion (p. ej. al editarla: borrar la venta + reconvertir), la nueva OF
// recibe el MISMO token y el enlace que ya tiene la proveedora sigue sirviendo,
// en vez de quedar en 404 con un token nuevo aleatorio. Es inadivinable para
// quien no conozca los ids internos (cuids) ni el secreto del servidor.
export function stableShareToken(quoteId: string, supplierId: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256")
    .update(`${secret}:fabricacion:${quoteId}:${supplierId}`)
    .digest("base64url")
    .slice(0, 32);
}
