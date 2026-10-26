import { leerDatos, leerLinks, leerOpciones } from "./duda";

// Lectura de la exportacion de la encuesta de claude.ai (carpeta con preguntas/qNNN.json y
// respuestas/qNNN.json). Puro: recibe el JSON ya parseado y devuelve lo que se guarda.

export const AUTOR_IMPORTADO = "Magilus (claude.ai)";

const CAMPOS_CONOCIDOS = new Set(["codigo", "grupo", "titulo", "duda", "orden", "estado", "datos", "links", "opciones"]);

export type DudaImportada = {
  id: string;
  codigo: string | null;
  grupo: string;
  titulo: string;
  duda: string;
  orden: number;
  datos: [string, string][];
  opciones: { id: string; label: string; texto?: string }[];
  links: { label: string; url: string }[];
  extra: Record<string, unknown> | null;
};

export type RespuestaImportada = {
  id: string;
  dudaId: string;
  opcionId: string;
  opcionTexto: string;
  texto: string;
  nota: string;
  autorNombre: string;
  createdAt: Date;
};

export function idDesdeArchivo(nombreArchivo: string): string | null {
  const m = /^(q\d{1,5})\.json$/i.exec(nombreArchivo.trim());
  return m ? m[1].toLowerCase() : null;
}

function cadena(valor: unknown): string {
  return typeof valor === "string" ? valor : valor == null ? "" : String(valor);
}

export function leerPreguntaExportada(id: string, json: unknown): DudaImportada {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error(`${id}: no es un objeto`);
  const p = json as Record<string, unknown>;
  const grupo = cadena(p.grupo).trim();
  const titulo = cadena(p.titulo).trim();
  if (!grupo || !titulo) throw new Error(`${id}: falta grupo o titulo`);
  const opciones = leerOpciones(p.opciones);
  if (!opciones.length) throw new Error(`${id}: no tiene opciones`);

  const extra: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(p)) {
    if (!CAMPOS_CONOCIDOS.has(clave)) extra[clave] = valor;
  }
  // "abierta" es lo normal; otro estado se conserva para no perderlo.
  if (p.estado != null && p.estado !== "abierta") extra.estado = p.estado;

  const codigo = cadena(p.codigo).trim();
  const orden = Number(p.orden);
  return {
    id,
    codigo: codigo || null,
    grupo,
    titulo,
    duda: cadena(p.duda),
    orden: Number.isFinite(orden) ? Math.trunc(orden) : 0,
    datos: leerDatos(p.datos),
    opciones,
    links: leerLinks(p.links),
    extra: Object.keys(extra).length ? extra : null,
  };
}

// Las respuestas viejas se importan con id fijo ("import-q001"): correr el script dos veces no duplica.
export function leerRespuestaExportada(dudaId: string, json: unknown): RespuestaImportada {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error(`${dudaId}: respuesta no es un objeto`);
  const r = json as Record<string, unknown>;
  const opcionId = cadena(r.opcion).trim();
  if (!opcionId) throw new Error(`${dudaId}: respuesta sin opcion`);
  const fecha = new Date(cadena(r.fecha));
  return {
    id: `import-${dudaId}`,
    dudaId,
    opcionId,
    opcionTexto: cadena(r.opcion_texto),
    texto: cadena(r.texto),
    nota: cadena(r.nota),
    autorNombre: AUTOR_IMPORTADO,
    createdAt: Number.isNaN(fecha.getTime()) ? new Date(0) : fecha,
  };
}
