// Registros retroactivos para el asesor (listar_retroactivos): lo mismo que /admin/retroactivos.
// Funciones puras: la lista (filtrada por persona) y el resumen por persona del mes (todas las personas).
// Imports relativos porque Vitest no resuelve el alias del proyecto.
import { colombiaDayKey, colombiaTimeOfDay } from "../../../lib/colombia-time";
import { TIPO_RETROACTIVO_LABEL, diaPuesto, diasDeAtraso, type TipoRetroactivo } from "../../retroactivos/domain/retroactivo";
import { resumirPorPersona } from "../../retroactivos/domain/resumen";

export type RetroactivoRow = {
  usuarioId: string;
  usuarioNombre: string | null;
  tipo: TipoRetroactivo;
  registroId: string;
  fechaPuesta: Date;
  registradoEn: Date;
  motivo: string | null;
  monto: number;
};

// Igual que la pagina: la lista se corta en 500 filas; el resumen cuenta todo el mes.
export const MAX_RETROACTIVOS = 500;
const SIN_DATO = "sin dato";

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const nombreDe = (row: RetroactivoRow) => row.usuarioNombre?.trim() || SIN_DATO;

const porTipo = (resumen: Record<TipoRetroactivo, { cantidad: number; monto: number }>) => ({
  venta: resumen.VENTA,
  abono: resumen.ABONO,
  gasto: resumen.GASTO,
});

// rows: los del mes (ya filtrados por tipo si se pidio), del mas reciente al mas viejo.
export function buildRetroactivosReport(rows: RetroactivoRow[], filtros: { mes: string; persona?: string | null }) {
  const nombrePorId = new Map(rows.map((row) => [row.usuarioId, nombreDe(row)]));
  const resumen = resumirPorPersona(
    rows.map((row) => ({ usuarioId: row.usuarioId, tipo: row.tipo, cantidad: 1, monto: row.monto })),
  ).map((item) => ({
    persona: nombrePorId.get(item.usuarioId) ?? SIN_DATO,
    cantidad: item.cantidad,
    por_tipo: porTipo(item.porTipo),
  }));

  const consulta = normalizar(filtros.persona ?? "");
  const filtradas = consulta ? rows.filter((row) => normalizar(nombreDe(row)).includes(consulta)) : rows;
  const registros = filtradas.slice(0, MAX_RETROACTIVOS).map((row) => ({
    tipo: TIPO_RETROACTIVO_LABEL[row.tipo],
    persona: nombreDe(row),
    registrado_el: `${colombiaDayKey(row.registradoEn)} ${colombiaTimeOfDay(row.registradoEn)}`,
    fecha_puesta: diaPuesto(row.fechaPuesta) ?? SIN_DATO,
    dias_de_atraso: diasDeAtraso(row.fechaPuesta, row.registradoEn),
    monto: row.monto,
    motivo: row.motivo?.trim() || SIN_DATO,
    registro_id: row.registroId,
  }));

  return {
    mes: filtros.mes,
    total: filtradas.length,
    mostrados: registros.length,
    registros,
    resumen_por_persona: resumen,
    nota: "Mes del registro real (hora Colombia). Retroactivo = fecha puesta de un dia anterior al dia en que se registro. El resumen cuenta a todas las personas del mes. Solo lectura.",
  };
}
