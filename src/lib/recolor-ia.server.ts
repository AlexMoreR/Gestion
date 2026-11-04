import "server-only";

// IA de respaldo para la vista previa de color (nov-2026): solo el punto de enganche. Proveedor y costo
// por definir con Alexander; hasta entonces no se llama a ningún servicio (pago o no) y siempre da null.
export type PedidoRecolorIa = { productId: string; fotoUrl: string; texto: string };

export async function recolorConIa(pedido: PedidoRecolorIa): Promise<string | null> {
  void pedido;
  if (!process.env.RECOLOR_IA_KEY?.trim()) return null;
  // shortcut: aun con RECOLOR_IA_KEY no hace nada; conectar el proveedor cuando Alexander lo autorice.
  return null;
}
