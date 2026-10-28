// Panel de estadisticas de NETMAGI (/admin/marketplace). Calculos puros, sin Prisma ni red.
//
// NETMAGI (crm-api, rutas /gestion/estadisticas/*) devuelve SOLO agregados: conteos por dia, por
// cuenta de Facebook y por producto. Aqui se validan esas respuestas (nunca se confia en la forma),
// se cruzan con las ventas de Gestion cuyo origen es MARKETPLACE (linea Ventas 2) y se arma el CSV.

import { effectiveOrigin } from "../../ventas/domain/sale-origin";

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 todo el ano
const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveRangeDays(raw: unknown): RangeDays {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (RANGE_OPTIONS as readonly number[]).includes(value) ? (value as RangeDays) : 30;
}

export type BogotaRange = { desde: string; hasta: string; days: number; from: Date; to: Date };

// Ultimos N dias de Bogota hasta hoy (incluido). from/to en UTC: [00:00 de desde, 00:00 del dia
// siguiente a hasta), el mismo criterio de NETMAGI.
export function bogotaRange(days: number, now: Date = new Date()): BogotaRange {
  const hasta = new Date(now.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
  const hastaUtc = Date.parse(`${hasta}T00:00:00Z`);
  const desde = new Date(hastaUtc - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return {
    desde,
    hasta,
    days,
    from: new Date(Date.parse(`${desde}T00:00:00Z`) + BOGOTA_OFFSET_MS),
    to: new Date(hastaUtc + DAY_MS + BOGOTA_OFFSET_MS),
  };
}

export function bogotaDay(date: Date): string {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Lectura defensiva de las respuestas de NETMAGI ───────────────────────────
type Json = Record<string, unknown>;
const isObj = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const str = (value: unknown, max = 160): string => (typeof value === "string" ? value.slice(0, max) : "");
const strOrNull = (value: unknown, max = 160): string | null => (typeof value === "string" && value ? value.slice(0, max) : null);
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const DAY_METRICS = [
  "entrantes",
  "respuestas",
  "whatsapp",
  "clientes_nuevos",
  "seguimientos",
  "sin_respuesta",
  "renovadas",
  "publicados",
  "fallidos",
  "por_verificar",
  "restricciones",
] as const;
export type DayMetric = (typeof DAY_METRICS)[number];
export type DayRow = { dia: string } & Record<DayMetric, number>;

export type Resumen = {
  desde: string;
  hasta: string;
  totales: Record<DayMetric, number> & { pasadas_renovacion: number; pct_whatsapp: number };
  cuentas: { total: number; en_vivo: number; fuera: number; sin_conexion: number };
  serie: DayRow[];
};

export function parseResumen(body: unknown): Resumen | null {
  if (!isObj(body) || body.ok !== true || !Array.isArray(body.serie) || !isObj(body.totales)) return null;
  const totals = body.totales;
  const accounts = isObj(body.cuentas) ? body.cuentas : {};
  const serie = body.serie
    .filter((row): row is Json => isObj(row) && isDay(row.dia))
    .map((row) => Object.assign({ dia: row.dia as string }, ...DAY_METRICS.map((key) => ({ [key]: num(row[key]) }))) as DayRow);
  return {
    desde: str(body.desde, 10),
    hasta: str(body.hasta, 10),
    totales: Object.assign(
      { pasadas_renovacion: num(totals.pasadas_renovacion), pct_whatsapp: num(totals.pct_whatsapp) },
      ...DAY_METRICS.map((key) => ({ [key]: num(totals[key]) })),
    ),
    cuentas: { total: num(accounts.total), en_vivo: num(accounts.en_vivo), fuera: num(accounts.fuera), sin_conexion: num(accounts.sin_conexion) },
    serie,
  };
}

export type AccountState = "en_vivo" | "fuera" | "sin_conexion";
export const ACCOUNT_STATE_LABEL: Readonly<Record<AccountState, string>> = {
  en_vivo: "En vivo",
  fuera: "Fuera de Messenger",
  sin_conexion: "Sin conexión",
};

export type CuentaRow = {
  id: string;
  nombre: string;
  estado: AccountState;
  ultimo_latido: string | null;
  entrantes: number;
  respuestas: number;
  whatsapp: number;
  clientes_nuevos: number;
  renovadas: number;
  ultima_renovacion: string | null; // "OK · 12" (resultado y cantidad)
  publicados: number;
  fallidos: number;
  habilitada: boolean;
  pausa: string;
  tope_diario: number;
  // Semaforo de hoy y de 7 dias (NETMAGI nuevo). Si NETMAGI aun no los manda, tieneHoy = false y valen 0.
  tieneHoy: boolean;
  publicados_hoy: number;
  renovadas_hoy: number;
  entrantes_hoy: number;
  restricciones_hoy: number;
  publicados_7d: number;
  clientes_7d: number;
  ubicacion: string; // ubicacion por defecto de la cuenta
};

export function parseCuentas(body: unknown): CuentaRow[] | null {
  if (!isObj(body) || body.ok !== true || !Array.isArray(body.cuentas)) return null;
  return body.cuentas.filter(isObj).map((row) => {
    const estado = row.estado === "en_vivo" || row.estado === "fuera" ? row.estado : "sin_conexion";
    const renov = isObj(row.ultima_renovacion) ? row.ultima_renovacion : null;
    return {
      id: str(row.id, 20),
      nombre: str(row.nombre, 80) || "(sin nombre)",
      estado,
      ultimo_latido: strOrNull(row.ultimo_latido, 30),
      entrantes: num(row.entrantes),
      respuestas: num(row.respuestas),
      whatsapp: num(row.whatsapp),
      clientes_nuevos: num(row.clientes_nuevos),
      renovadas: num(row.renovadas),
      ultima_renovacion: renov ? `${str(renov.resultado, 40) || "?"} · ${num(renov.cantidad)}` : null,
      publicados: num(row.publicados),
      fallidos: num(row.fallidos),
      habilitada: row.publicador_habilitada === true,
      pausa: str(row.publicador_pausa, 200),
      tope_diario: num(row.tope_diario),
      tieneHoy: "publicados_hoy" in row,
      publicados_hoy: num(row.publicados_hoy),
      renovadas_hoy: num(row.renovadas_hoy),
      entrantes_hoy: num(row.entrantes_hoy),
      restricciones_hoy: num(row.restricciones_hoy),
      publicados_7d: num(row.publicados_7d),
      clientes_7d: num(row.clientes_7d),
      ubicacion: str(row.ubicacion, 80),
    };
  });
}

export type ProductoRow = { producto: string; codigo: string | null; chats: number; entrantes: number; whatsapp: number; pct_whatsapp: number; cuentas: number };

export function parseProductos(body: unknown): ProductoRow[] | null {
  if (!isObj(body) || body.ok !== true || !Array.isArray(body.productos)) return null;
  return body.productos.filter(isObj).map((row) => ({
    producto: str(row.producto, 120) || "(sin producto)",
    codigo: typeof row.codigo === "string" && /^[A-Z]{2,3}\d{3}$/.test(row.codigo) ? row.codigo : null,
    chats: num(row.chats),
    entrantes: num(row.entrantes),
    whatsapp: num(row.whatsapp),
    pct_whatsapp: num(row.pct_whatsapp),
    cuentas: num(row.cuentas),
  }));
}

// ── Anuncios del publicador (uno por fila) ───────────────────────────────────
export const AD_STATE_LABEL: Readonly<Record<string, string>> = {
  publicado: "Publicado",
  por_verificar: "Por verificar",
  fallido: "Fallido",
};

export type AnuncioRow = {
  id: string;
  dia: string; // dia de publicacion (Bogota)
  publicado_at: string | null;
  cuenta_id: string;
  cuenta: string;
  estado: string;
  codigo: string | null;
  producto: string;
  precio: number;
  url: string | null; // solo enlaces de anuncios de Facebook Marketplace
  ubicacion: string;
  ciudad: string;
  ubicacion_estimada: boolean; // true = no se leyo de Facebook: es la ubicacion por defecto de la cuenta
  chats: number; // clientes atribuidos al anuncio por titulo (aproximado)
  whatsapp: number;
};

export type Anuncios = { total: number; truncado: boolean; anuncios: AnuncioRow[] };

// Solo se enlazan anuncios de Marketplace: nunca un href que venga de fuera con otro destino.
const AD_URL = /^https:\/\/(www\.|web\.|m\.)?facebook\.com\/marketplace\/item\/\d+/;

export function parseAnuncios(body: unknown): Anuncios | null {
  if (!isObj(body) || body.ok !== true || !Array.isArray(body.anuncios)) return null;
  const anuncios = body.anuncios
    .filter((row): row is Json => isObj(row) && isDay(row.dia))
    .map((row) => ({
      id: str(row.id, 20),
      dia: row.dia as string,
      publicado_at: strOrNull(row.publicado_at, 30),
      cuenta_id: str(row.cuenta_id, 20),
      cuenta: str(row.cuenta, 80) || "(sin nombre)",
      estado: str(row.estado, 30),
      codigo: typeof row.codigo === "string" && /^[A-Z]{2,3}\d{3}$/.test(row.codigo) ? row.codigo : null,
      producto: str(row.producto, 120) || "(sin titulo)",
      precio: num(row.precio),
      url: typeof row.url === "string" && AD_URL.test(row.url) ? row.url.slice(0, 200) : null,
      ubicacion: str(row.ubicacion, 120),
      ciudad: str(row.ciudad, 80) || "(sin ciudad)",
      ubicacion_estimada: row.ubicacion_estimada !== false,
      chats: num(row.chats),
      whatsapp: num(row.whatsapp),
    }));
  return { total: num(body.total) || anuncios.length, truncado: body.truncado === true, anuncios };
}

export type PublicadorItem = { hora: string | null; estado: string; cuenta: string; producto: string; codigo: string | null; modo?: string | null; campo?: string | null };
export type Publicador = {
  config: {
    activo: boolean;
    pausa_motivo: string;
    por_dia: number;
    hora_inicio: number;
    hora_fin: number;
    separacion_min: number;
    dias_sin_repetir: number;
    aprobacion_manual: boolean;
    publicar_automatico: boolean;
    cuentas_habilitadas: number;
  };
  hoy: { fecha: string; por_estado: Record<string, number>; cola: PublicadorItem[] };
  periodo: { resultados: Record<string, number>; publicados_por_modo: Record<string, number>; fallos_por_campo: Record<string, number> };
  ultimos: PublicadorItem[];
  inventario: { productos: number; con_fotos_validas: number; con_codigo_gestion: number };
};

function countMap(value: unknown): Record<string, number> {
  if (!isObj(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, count]) => [key.slice(0, 40), num(count)]));
}

export function parsePublicador(body: unknown): Publicador | null {
  if (!isObj(body) || body.ok !== true || !isObj(body.config)) return null;
  const c = body.config;
  const hoy = isObj(body.hoy) ? body.hoy : {};
  const periodo = isObj(body.periodo) ? body.periodo : {};
  const inv = isObj(body.inventario) ? body.inventario : {};
  const item = (row: Json, timeKey: string): PublicadorItem => ({
    hora: strOrNull(row[timeKey], 30),
    estado: str(row.estado ?? row.resultado, 30),
    cuenta: str(row.cuenta, 80),
    producto: str(row.producto, 120),
    codigo: typeof row.codigo === "string" && /^[A-Z]{2,3}\d{3}$/.test(row.codigo) ? row.codigo : null,
    modo: strOrNull(row.modo, 20),
    campo: strOrNull(row.campo, 40),
  });
  return {
    config: {
      activo: c.activo === true,
      pausa_motivo: str(c.pausa_motivo, 200),
      por_dia: num(c.por_dia),
      hora_inicio: num(c.hora_inicio),
      hora_fin: num(c.hora_fin),
      separacion_min: num(c.separacion_min),
      dias_sin_repetir: num(c.dias_sin_repetir),
      aprobacion_manual: c.aprobacion_manual !== false,
      publicar_automatico: c.publicar_automatico !== false,
      cuentas_habilitadas: num(c.cuentas_habilitadas),
    },
    hoy: {
      fecha: str(hoy.fecha, 10),
      por_estado: countMap(hoy.por_estado),
      cola: (Array.isArray(hoy.cola) ? hoy.cola : []).filter(isObj).slice(0, 100).map((row) => item(row, "hora")),
    },
    periodo: {
      resultados: countMap(periodo.resultados),
      publicados_por_modo: countMap(periodo.publicados_por_modo),
      fallos_por_campo: countMap(periodo.fallos_por_campo),
    },
    ultimos: (Array.isArray(body.ultimos) ? body.ultimos : []).filter(isObj).slice(0, 30).map((row) => item(row, "ts")),
    inventario: { productos: num(inv.productos), con_fotos_validas: num(inv.con_fotos_validas), con_codigo_gestion: num(inv.con_codigo_gestion) },
  };
}

// ── "Qué funciona": fórmula de venta de NETMAGI (ruta /formula, fase 9) ─────────
// NETMAGI prueba varias fórmulas de título, mide cuál trae más clientes y usa la mejor (80 %) mientras sigue
// explorando (20 %). Aquí solo se lee el reporte: ranking de variantes, categorías, productos, cuentas y la
// variante ganadora con lo que falta para confirmarla.
export type FormulaVariante = {
  variante: string;
  nombre: string;
  anuncios: number;
  clics: number;
  con_clics: number; // anuncios de los que se leyeron clics (los demás no cuentan en el promedio)
  mensajes: number;
  con_mensajes: number;
  clientes: number;
  whatsapp: number;
  tasa: number; // por anuncio, con la señal elegida (clientes > mensajes > clics)
  suficiente: boolean;
  faltan: number; // anuncios que faltan para llegar al mínimo
  clientes_por_anuncio: number;
};
export type FormulaGrupo = { nombre: string; anuncios: number; clientes: number; clientes_por_anuncio: number; mejor_variante: string | null };
export type FormulaEstado = "confirmada" | "provisional" | "falta_comparar" | "sin_ganadora" | "sin_datos";
export type Formula = {
  senal: "clientes" | "mensajes" | "clics" | null;
  estado: FormulaEstado;
  ganadora: { variante: string; nombre: string; tasa: number; senal: string; n: number; ventaja_sobre_base: number | null } | null;
  variantes: FormulaVariante[];
  faltan: { anuncios_totales: number; minimo: number; ventana_dias: number; variantes: { variante: string; nombre: string; faltan: number }[] };
  porCategoria: FormulaGrupo[];
  porProducto: FormulaGrupo[];
  porCuenta: FormulaGrupo[];
  config: { activo: boolean; fija: string | null; epsilon: number; min_anuncios: number; ventana_dias: number };
  atribucion: { id: number; titulo_exacto: number; titulo_aproximado: number; pct_exacta: number | null };
  metricas: {
    confirmadas: boolean; // alguna lectura de Tus publicaciones trajo cifras
    cuentas: { cuenta: string; ultima_lectura: string | null; anuncios_vistos: number; con_metricas: number; restriccion: boolean }[];
  };
};

const FORMULA_ESTADOS: readonly FormulaEstado[] = ["confirmada", "provisional", "falta_comparar", "sin_ganadora", "sin_datos"];

// NETMAGI sin el cálculo responde ok con disponible:false (se trata como "ruta que falta").
export function formulaNoDisponible(body: unknown): boolean {
  return isObj(body) && body.disponible === false;
}

function parseFormulaGrupos(value: unknown): FormulaGrupo[] {
  return (Array.isArray(value) ? value : []).filter(isObj).slice(0, 30).map((row) => ({
    nombre: str(row.nombre, 120) || "(sin nombre)",
    anuncios: num(row.anuncios),
    clientes: num(row.clientes),
    clientes_por_anuncio: num(row.clientes_por_anuncio),
    mejor_variante: strOrNull(row.mejor_variante, 40),
  }));
}

export function parseFormula(body: unknown): Formula | null {
  if (!isObj(body) || body.ok !== true || body.disponible === false || !Array.isArray(body.variantes)) return null;
  const cfg = isObj(body.config) ? body.config : {};
  const falta = isObj(body.faltan_para_confirmar) ? body.faltan_para_confirmar : {};
  const g = isObj(body.ganadora) ? body.ganadora : null;
  const at = isObj(body.atribucion) ? body.atribucion : {};
  const met = isObj(body.metricas_leidas) ? body.metricas_leidas : {};
  const estado = FORMULA_ESTADOS.find((e) => e === body.estado_ganadora) ?? "sin_datos";
  return {
    senal: body.senal === "clientes" || body.senal === "mensajes" || body.senal === "clics" ? body.senal : null,
    estado,
    ganadora: g
      ? {
          variante: str(g.variante, 40),
          nombre: str(g.nombre, 120) || str(g.variante, 40),
          tasa: num(g.tasa),
          senal: str(g.senal, 20),
          n: num(g.n),
          ventaja_sobre_base: g.ventaja_sobre_base == null ? null : num(g.ventaja_sobre_base),
        }
      : null,
    variantes: body.variantes.filter(isObj).slice(0, 30).map((row) => ({
      variante: str(row.variante, 40),
      nombre: str(row.nombre, 120) || str(row.variante, 40),
      anuncios: num(row.anuncios),
      clics: num(row.clics),
      con_clics: num(row.con_clics),
      mensajes: num(row.mensajes),
      con_mensajes: num(row.con_mensajes),
      clientes: num(row.clientes),
      whatsapp: num(row.whatsapp),
      tasa: num(row.tasa),
      suficiente: row.suficiente === true,
      faltan: num(row.faltan),
      clientes_por_anuncio: num(row.clientes_por_anuncio),
    })),
    faltan: {
      anuncios_totales: num(falta.anuncios_totales),
      minimo: num(falta.minimo_por_variante),
      ventana_dias: num(falta.ventana_dias),
      variantes: (Array.isArray(falta.variantes) ? falta.variantes : []).filter(isObj).slice(0, 30).map((row) => ({
        variante: str(row.variante, 40),
        nombre: str(row.nombre, 120) || str(row.variante, 40),
        faltan: num(row.faltan),
      })),
    },
    porCategoria: parseFormulaGrupos(body.por_categoria),
    porProducto: parseFormulaGrupos(body.por_producto),
    porCuenta: parseFormulaGrupos(body.por_cuenta),
    config: {
      activo: cfg.activo !== false,
      fija: strOrNull(cfg.fija, 40),
      epsilon: num(cfg.epsilon),
      min_anuncios: num(cfg.min_anuncios),
      ventana_dias: num(cfg.ventana_dias),
    },
    atribucion: {
      id: num(at.id),
      titulo_exacto: num(at.titulo_exacto),
      titulo_aproximado: num(at.titulo_aproximado),
      pct_exacta: at.pct_exacta == null ? null : num(at.pct_exacta),
    },
    metricas: {
      confirmadas: met.confirmadas === true,
      cuentas: (Array.isArray(met.cuentas) ? met.cuentas : []).filter(isObj).slice(0, 20).map((row) => ({
        cuenta: str(row.cuenta, 80) || "(sin nombre)",
        ultima_lectura: strOrNull(row.ultima_lectura, 40),
        anuncios_vistos: num(row.anuncios_vistos),
        con_metricas: num(row.con_metricas),
        restriccion: row.restriccion === true,
      })),
    },
  };
}

// ── Cruce con las ventas de Gestion (origen MARKETPLACE = linea Ventas 2) ─────
export type ChannelSale = { recognizedAt: Date; amount: number; profit: number; origin: unknown };
export type ChannelSales = { count: number; revenue: number; profit: number; byDay: Record<string, number>; closeRatePct: number | null };

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

// Ventas reconocidas (criterio de Balances) con origen MARKETPLACE dentro del rango de Bogota.
// closeRatePct = ventas / clientes nuevos de NETMAGI (null si no hay chats nuevos).
export function marketplaceSales(sales: ChannelSale[], range: Pick<BogotaRange, "from" | "to">, newChats: number): ChannelSales {
  const inChannel = sales.filter(
    (sale) => effectiveOrigin(sale.origin) === "MARKETPLACE" && sale.recognizedAt >= range.from && sale.recognizedAt < range.to,
  );
  const byDay: Record<string, number> = {};
  for (const sale of inChannel) {
    const day = bogotaDay(sale.recognizedAt);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  return {
    count: inChannel.length,
    revenue: round(inChannel.reduce((sum, sale) => sum + sale.amount, 0)),
    profit: round(inChannel.reduce((sum, sale) => sum + sale.profit, 0)),
    byDay,
    closeRatePct: newChats > 0 ? round((inChannel.length / newChats) * 100, 1) : null,
  };
}

export type ChartDay = { dia: string; label: string; entrantes: number; respuestas: number; whatsapp: number; publicados: number; fallidos: number; ventas: number };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-10-07" -> "7 oct" (sin Intl: servidor y navegador pintan lo mismo)
export function shortDayLabel(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1] ?? ""}`.trim();
}

export function toChartDays(serie: DayRow[], salesByDay: Record<string, number> = {}): ChartDay[] {
  return serie.map((row) => ({
    dia: row.dia,
    label: shortDayLabel(row.dia),
    entrantes: row.entrantes,
    respuestas: row.respuestas,
    whatsapp: row.whatsapp,
    publicados: row.publicados,
    fallidos: row.fallidos + row.restricciones,
    ventas: salesByDay[row.dia] ?? 0,
  }));
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

// ── Tablas ordenables y CSV ───────────────────────────────────────────────────
export type SortDir = "asc" | "desc";

export function sortRows<T>(rows: readonly T[], key: keyof T, dir: SortDir): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // vacios siempre al final
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * factor;
    if (typeof x === "boolean" && typeof y === "boolean") return (Number(x) - Number(y)) * factor;
    return String(x).localeCompare(String(y), "es", { numeric: true }) * factor;
  });
}

export type CsvColumn<T> = { key: keyof T; label: string };

// Celda CSV: comillas si hace falta y, para texto, un apostrofe delante de = + - @ (evita formulas
// al abrirlo en Excel/Sheets). Los numeros se dejan tal cual.
export function csvCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "si" : "no";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`; // BOM: Excel abre bien las tildes
}

// "2026-10-23T15:04:00Z" -> "23/10 10:04" (hora Bogota). Sin Intl para que servidor y navegador
// pinten exactamente lo mismo.
export function formatBogotaDateTime(iso: string | null): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const local = new Date(time - BOGOTA_OFFSET_MS).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

// Lo que la pagina recibe de NETMAGI (cada seccion puede faltar si su ruta fallo).
export type NetmagiStats = {
  ok: boolean;
  error: string | null;
  resumen: Resumen | null;
  cuentas: CuentaRow[] | null;
  productos: ProductoRow[] | null;
  publicador: Publicador | null;
  anuncios: Anuncios | null;
  // true = NETMAGI todavia no tiene la ruta /anuncios (se despliegan por separado): el resto de la pagina funciona.
  anunciosFaltan: boolean;
  // "Que funciona" (fase 9). formulaFaltan = NETMAGI todavia no tiene la ruta /formula: se muestra un aviso y nada mas.
  formula: Formula | null;
  formulaFaltan: boolean;
};
