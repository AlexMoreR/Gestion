import type { TipoRetroactivo } from "./retroactivo";

export type ConteoRetroactivo = {
  usuarioId: string;
  tipo: TipoRetroactivo;
  cantidad: number;
  monto: number;
};

export type ResumenPersona = {
  usuarioId: string;
  cantidad: number;
  // Suma por tipo: no se mezclan ventas, abonos y gastos en un solo total.
  porTipo: Record<TipoRetroactivo, { cantidad: number; monto: number }>;
};

// Agrupa los conteos (usuario, tipo) por persona, de mayor a menor cantidad.
export function resumirPorPersona(conteos: ConteoRetroactivo[]): ResumenPersona[] {
  const byUser = new Map<string, ResumenPersona>();
  for (const conteo of conteos) {
    let resumen = byUser.get(conteo.usuarioId);
    if (!resumen) {
      resumen = {
        usuarioId: conteo.usuarioId,
        cantidad: 0,
        porTipo: {
          VENTA: { cantidad: 0, monto: 0 },
          ABONO: { cantidad: 0, monto: 0 },
          GASTO: { cantidad: 0, monto: 0 },
        },
      };
      byUser.set(conteo.usuarioId, resumen);
    }
    resumen.cantidad += conteo.cantidad;
    resumen.porTipo[conteo.tipo].cantidad += conteo.cantidad;
    resumen.porTipo[conteo.tipo].monto += conteo.monto;
  }
  return [...byUser.values()].sort((a, b) => b.cantidad - a.cantidad);
}
