// Reglas puras de "Dudas del catalogo": forma de una pregunta, validacion de la respuesta,
// agrupado/filtro de la lista y deteccion de fotos. Sin Prisma ni Next.

export const GRUPOS_DUDAS = ["nombre", "duplicado", "categoria", "foto", "separar", "negocio", "descripcion"] as const;

export const ETIQUETAS_GRUPO: Record<string, string> = {
  nombre: "Nombre del producto",
  duplicado: "¿Es el mismo producto?",
  categoria: "Categorías",
  foto: "Fotos",
  separar: "Separar fotos",
  negocio: "Datos del negocio",
  descripcion: "Descripción",
};

export function etiquetaGrupo(grupo: string): string {
  return ETIQUETAS_GRUPO[grupo] ?? grupo;
}

export type OpcionDuda = { id: string; label: string; texto?: string };
export type LinkDuda = { label: string; url: string };
export type DatoDuda = [string, string];

export type Duda = {
  id: string;
  codigo: string | null;
  grupo: string;
  titulo: string;
  duda: string;
  orden: number;
  datos: DatoDuda[];
  opciones: OpcionDuda[];
  links: LinkDuda[];
  extra: Record<string, unknown> | null;
  activa: boolean;
};

export type Respuesta = {
  id: string;
  dudaId: string;
  opcionId: string;
  opcionTexto: string;
  texto: string;
  nota: string;
  autorNombre: string;
  accesoId: string | null;
  createdAt: Date;
};

export type FiltroDudas = "pendientes" | "respondidas" | "todas";
export const FILTROS_DUDAS: FiltroDudas[] = ["todas", "pendientes", "respondidas"];

export function leerFiltro(valor: unknown): FiltroDudas {
  return FILTROS_DUDAS.includes(valor as FiltroDudas) ? (valor as FiltroDudas) : "pendientes";
}

// --- Lectura segura de los Json guardados ---

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : valor == null ? "" : String(valor);
}

export function leerDatos(valor: unknown): DatoDuda[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((fila): fila is unknown[] => Array.isArray(fila) && fila.length >= 2)
    .map((fila) => [texto(fila[0]), texto(fila[1])] as DatoDuda);
}

export function leerOpciones(valor: unknown): OpcionDuda[] {
  if (!Array.isArray(valor)) return [];
  const opciones: OpcionDuda[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = texto(o.id).trim();
    if (!id) continue;
    const opcion: OpcionDuda = { id, label: texto(o.label) || id };
    if (typeof o.texto === "string" && o.texto.trim()) opcion.texto = o.texto;
    opciones.push(opcion);
  }
  return opciones;
}

function esUrlSegura(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function leerLinks(valor: unknown): LinkDuda[] {
  if (!Array.isArray(valor)) return [];
  const links: LinkDuda[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const url = texto(l.url).trim();
    if (!esUrlSegura(url)) continue;
    links.push({ label: texto(l.label) || "Ver enlace", url });
  }
  return links;
}

// --- Fotos: URLs de imagen que traiga la pregunta (datos, links o campos de mas) ---

const PATRON_URL = /https?:\/\/[^\s"'<>]+/gi;

export function esUrlDeImagen(url: string): boolean {
  return (
    /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url) ||
    /^https?:\/\/(lh\d+\.googleusercontent\.com|drive\.google\.com\/thumbnail)/i.test(url)
  );
}

function urlsEn(valor: unknown, salida: string[], profundidad = 0): void {
  if (profundidad > 4 || valor == null) return;
  if (typeof valor === "string") {
    for (const url of valor.match(PATRON_URL) ?? []) salida.push(url);
    return;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) urlsEn(item, salida, profundidad + 1);
    return;
  }
  if (typeof valor === "object") {
    for (const item of Object.values(valor as Record<string, unknown>)) urlsEn(item, salida, profundidad + 1);
  }
}

export function fotosDeLaDuda(duda: Pick<Duda, "datos" | "links" | "extra">): string[] {
  const urls: string[] = [];
  urlsEn(duda.datos, urls);
  urlsEn(duda.links.map((l) => l.url), urls);
  urlsEn(duda.extra, urls);
  return [...new Set(urls.filter(esUrlDeImagen))].slice(0, 12);
}

// --- Respuesta: validar lo que manda la asesora ---

export const MAX_TEXTO = 2000;
export const MAX_NOTA = 1000;

export type EntradaRespuesta = { opcionId: string; texto: string; nota: string };

export type RespuestaValidada =
  | { ok: true; opcionId: string; opcionTexto: string; texto: string; nota: string }
  | { ok: false; error: string };

export function validarRespuesta(duda: Pick<Duda, "opciones">, entrada: EntradaRespuesta): RespuestaValidada {
  const opcion = duda.opciones.find((o) => o.id === entrada.opcionId);
  if (!opcion) return { ok: false, error: "Elige una de las opciones." };
  const detalle = entrada.texto.trim();
  const nota = entrada.nota.trim();
  if (opcion.texto && !detalle) return { ok: false, error: "Escribe el detalle que se pide en el cuadro de texto." };
  if (detalle.length > MAX_TEXTO) return { ok: false, error: `El detalle es muy largo (máximo ${MAX_TEXTO} caracteres).` };
  if (nota.length > MAX_NOTA) return { ok: false, error: `La nota es muy larga (máximo ${MAX_NOTA} caracteres).` };
  return { ok: true, opcionId: opcion.id, opcionTexto: opcion.label, texto: opcion.texto ? detalle : "", nota };
}

// --- Lista: vigente por duda, filtro y agrupado ---

export function respuestaVigentePorDuda(respuestas: Respuesta[]): Map<string, Respuesta> {
  const vigente = new Map<string, Respuesta>();
  for (const r of respuestas) {
    const actual = vigente.get(r.dudaId);
    if (!actual || r.createdAt.getTime() >= actual.createdAt.getTime()) vigente.set(r.dudaId, r);
  }
  return vigente;
}

export type TarjetaDuda = Duda & { vigente: Respuesta | null; fotos: string[] };
export type GrupoDudas = { grupo: string; etiqueta: string; total: number; pendientes: number; tarjetas: TarjetaDuda[] };

export function armarTablero(dudas: Duda[], vigentes: Map<string, Respuesta>, filtro: FiltroDudas) {
  const ordenGrupo = (g: string) => {
    const i = (GRUPOS_DUDAS as readonly string[]).indexOf(g);
    return i === -1 ? GRUPOS_DUDAS.length : i;
  };
  const activas = dudas
    .filter((d) => d.activa)
    .sort((a, b) => ordenGrupo(a.grupo) - ordenGrupo(b.grupo) || a.grupo.localeCompare(b.grupo) || a.orden - b.orden || a.id.localeCompare(b.id));

  const grupos = new Map<string, GrupoDudas>();
  let pendientes = 0;
  for (const d of activas) {
    const vigente = vigentes.get(d.id) ?? null;
    let grupo = grupos.get(d.grupo);
    if (!grupo) {
      grupo = { grupo: d.grupo, etiqueta: etiquetaGrupo(d.grupo), total: 0, pendientes: 0, tarjetas: [] };
      grupos.set(d.grupo, grupo);
    }
    grupo.total += 1;
    if (!vigente) {
      grupo.pendientes += 1;
      pendientes += 1;
    }
    const entra = filtro === "todas" || (filtro === "pendientes" ? !vigente : Boolean(vigente));
    if (entra) grupo.tarjetas.push({ ...d, vigente, fotos: fotosDeLaDuda(d) });
  }
  return {
    total: activas.length,
    pendientes,
    respondidas: activas.length - pendientes,
    grupos: [...grupos.values()],
  };
}

// --- CSV ---

function celdaCsv(valor: string): string {
  // Evita que Excel ejecute formulas ("=", "+", "-", "@").
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return /[",\n\r;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function filasCsv(filas: string[][]): string {
  return filas.map((fila) => fila.map(celdaCsv).join(",")).join("\r\n");
}

// "21 oct 2026, 12:12 p. m." en hora de Colombia (igual en servidor y navegador).
export function formatearFecha(fecha: Date | string): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
