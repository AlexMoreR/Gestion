import { armarTablero, etiquetaGrupo, filasCsv, respuestaVigentePorDuda, type Duda, type FiltroDudas, type Respuesta } from "../domain/duda";

// Reportes de solo lectura: resumen por grupo, tabla de respuestas, CSV y la API para Claude.

export type FilaRespuesta = {
  respuesta: Respuesta;
  duda: Duda | null;
  vigente: boolean;
};

export function resumenPorGrupo(dudas: Duda[], respuestas: Respuesta[]) {
  const tablero = armarTablero(dudas, respuestaVigentePorDuda(respuestas), "todas");
  return {
    total: tablero.total,
    pendientes: tablero.pendientes,
    respondidas: tablero.respondidas,
    grupos: tablero.grupos.map((g) => ({ grupo: g.grupo, etiqueta: g.etiqueta, total: g.total, pendientes: g.pendientes, respondidas: g.total - g.pendientes })),
  };
}

/** Todas las respuestas (historial), la mas nueva primero, marcando la vigente de cada duda. */
export function filasDeRespuestas(dudas: Duda[], respuestas: Respuesta[]): FilaRespuesta[] {
  const porId = new Map(dudas.map((d) => [d.id, d]));
  const vigentes = respuestaVigentePorDuda(respuestas);
  return [...respuestas]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({ respuesta: r, duda: porId.get(r.dudaId) ?? null, vigente: vigentes.get(r.dudaId)?.id === r.id }));
}

export function csvDeRespuestas(filas: FilaRespuesta[]): string {
  const encabezado = ["duda_id", "codigo", "grupo", "titulo", "opcion_id", "opcion", "detalle", "nota", "respondio", "fecha", "vigente"];
  const cuerpo = filas.map(({ respuesta: r, duda: d, vigente }) => [
    r.dudaId,
    d?.codigo ?? "",
    d ? etiquetaGrupo(d.grupo) : "",
    d?.titulo ?? "",
    r.opcionId,
    r.opcionTexto,
    r.texto,
    r.nota,
    r.autorNombre,
    r.createdAt.toISOString(),
    vigente ? "si" : "no",
  ]);
  // BOM para que Excel abra bien las tildes.
  return `﻿${filasCsv([encabezado, ...cuerpo])}\r\n`;
}

const aRespuestaApi = (r: Respuesta) => ({
  opcion_id: r.opcionId,
  opcion: r.opcionTexto,
  texto: r.texto,
  nota: r.nota,
  por: r.autorNombre,
  fecha: r.createdAt.toISOString(),
});

export function respuestasParaApi(
  dudas: Duda[],
  respuestas: Respuesta[],
  opciones: { estado: FiltroDudas | "todas"; grupo?: string; historial?: boolean },
) {
  const vigentes = respuestaVigentePorDuda(respuestas);
  const porDuda = new Map<string, Respuesta[]>();
  for (const r of respuestas) porDuda.set(r.dudaId, [...(porDuda.get(r.dudaId) ?? []), r]);

  const items = dudas
    .filter((d) => d.activa && (!opciones.grupo || d.grupo === opciones.grupo))
    .filter((d) => {
      const tiene = vigentes.has(d.id);
      return opciones.estado === "todas" || (opciones.estado === "pendientes" ? !tiene : tiene);
    })
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.orden - b.orden || a.id.localeCompare(b.id))
    .map((d) => {
      const vigente = vigentes.get(d.id);
      const base = {
        id: d.id,
        codigo: d.codigo,
        grupo: d.grupo,
        titulo: d.titulo,
        duda: d.duda,
        datos: d.datos,
        opciones: d.opciones,
        respondida: Boolean(vigente),
        respuesta: vigente ? aRespuestaApi(vigente) : null,
      };
      if (!opciones.historial) return base;
      const historial = (porDuda.get(d.id) ?? [])
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(aRespuestaApi);
      return { ...base, historial };
    });

  const resumen = resumenPorGrupo(dudas, respuestas);
  return { total: resumen.total, pendientes: resumen.pendientes, respondidas: resumen.respondidas, dudas: items };
}
