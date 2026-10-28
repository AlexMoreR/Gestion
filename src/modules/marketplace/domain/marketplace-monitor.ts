// Monitoreo de Marketplace (/admin/marketplace): logica pura de las tarjetas de HOY, el semaforo,
// la lista de cuentas, el filtro de anuncios y el grafico. Sin red, sin React, sin Prisma.
//
// Pregunta de 5 segundos: ¿esta publicando bien hoy? ¿que cuentas estan vivas? ¿cuantos clientes trae?
// ¿hay restricciones?

import {
  type AnuncioRow,
  type CuentaRow,
  type DayRow,
  type Formula,
  type Publicador,
  type Resumen,
  shortDayLabel,
} from "./marketplace-stats";

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// ── "Qué funciona" (fórmula de venta) ─────────────────────────────────────────
const SENAL_LABEL: Record<string, string> = { clientes: "clientes", mensajes: "mensajes", clics: "clics" };
const decimal = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

// Titular de la sección: qué fórmula de título va ganando y qué tan firme es.
// confirmada = todas las fórmulas tienen datos suficientes; provisional = gana una, pero faltan datos en otras.
export function formulaVerdict(formula: Formula): { tone: Tone; title: string; reasons: string[] } {
  const reasons: string[] = [];
  const window = formula.faltan.ventana_dias || formula.config.ventana_dias;
  if (!formula.config.activo) reasons.push("Las fórmulas están apagadas: todos los anuncios salen con el título base.");
  else if (formula.config.fija) reasons.push("Hay una fórmula fijada a mano: no se está probando otra.");
  if (formula.faltan.anuncios_totales > 0) {
    reasons.push(`Faltan ${formula.faltan.anuncios_totales} anuncio(s) en total para que cada fórmula tenga sus ${formula.faltan.minimo} (ventana de ${window} días).`);
  }
  if (!formula.metricas.confirmadas) reasons.push("Aún no se leen clics ni mensajes de Facebook: se aprende de los clientes que llegan.");
  const g = formula.ganadora;
  if (g && (formula.estado === "confirmada" || formula.estado === "provisional")) {
    const unit = SENAL_LABEL[g.senal] ?? g.senal;
    const lead = g.ventaja_sobre_base != null && g.ventaja_sobre_base > 0 ? ` (+${g.ventaja_sobre_base} % sobre el título solo)` : "";
    return {
      tone: formula.estado === "confirmada" ? "ok" : "warn",
      title: `${formula.estado === "confirmada" ? "Gana" : "Va ganando"} «${g.nombre}»: ${decimal(g.tasa)} ${unit} por anuncio${lead}`,
      reasons,
    };
  }
  if (formula.estado === "falta_comparar") return { tone: "neutral", title: "Todavía no hay con qué comparar: solo una fórmula tiene datos suficientes", reasons };
  if (formula.estado === "sin_ganadora") return { tone: "neutral", title: "Todavía no hay una fórmula ganadora", reasons };
  return { tone: "neutral", title: "Todavía no hay datos para comparar títulos", reasons };
}

// Dia en que arranco el publicador (los anuncios del publicador empiezan ahi). Linea del grafico.
export const PUBLISHER_START = "2026-10-23";

export type Tone = "ok" | "warn" | "bad" | "neutral";

// ── Tiempo ────────────────────────────────────────────────────────────────────
export function bogotaHour(nowIso: string): number {
  const time = Date.parse(nowIso);
  return Number.isFinite(time) ? new Date(time - BOGOTA_OFFSET_MS).getUTCHours() : 0;
}

export function bogotaDate(nowIso: string): string {
  const time = Date.parse(nowIso);
  return new Date((Number.isFinite(time) ? time : 0) - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

// "hace 3 min". Se calcula contra la hora en que el servidor armo la pagina (igual en servidor y navegador).
export function agoText(iso: string | null, nowIso: string): string {
  if (!iso) return "nunca";
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return "—";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 2) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 48 * 60) return `hace ${Math.round(minutes / 60)} h`;
  return `hace ${Math.round(minutes / 1440)} días`;
}

// ── Tarjetas de hoy ────────────────────────────────────────────────────────────
export type Trend = { today: number; yesterday: number; avg7: number | null; reachedYesterday: boolean };

const ZERO_DAY = (dia: string): DayRow => ({
  dia,
  entrantes: 0,
  respuestas: 0,
  whatsapp: 0,
  clientes_nuevos: 0,
  seguimientos: 0,
  sin_respuesta: 0,
  renovadas: 0,
  publicados: 0,
  fallidos: 0,
  por_verificar: 0,
  restricciones: 0,
});

type NumericDayKey = Exclude<keyof DayRow, "dia">;

// Hoy contra ayer y contra el promedio de los 7 dias anteriores a hoy. Hoy es un dia a medias: por eso no se
// compara "lleva menos que ayer" como si fuera malo; solo se avisa cuando ya igualo o supero a ayer.
export function trendOf(serie: readonly DayRow[], key: NumericDayKey, today: string): Trend {
  const byDay = new Map(serie.map((row) => [row.dia, row]));
  const dayBefore = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
  const value = (day: string) => byDay.get(day)?.[key] ?? 0;
  const previous = Array.from({ length: 7 }, (_, i) => dayBefore(i + 1)).filter((day) => byDay.has(day));
  const avg7 = previous.length ? Math.round((previous.reduce((sum, day) => sum + value(day), 0) / previous.length) * 10) / 10 : null;
  const yesterday = value(dayBefore(1));
  const current = value(today);
  return { today: current, yesterday, avg7, reachedYesterday: yesterday > 0 && current >= yesterday };
}

export type Verdict = { tone: Tone; title: string; reasons: string[] };

export type VerdictInput = {
  publicador: Publicador | null;
  cuentas: CuentaRow[] | null;
  today: DayRow;
  hour: number; // hora de Bogota
};

// Cuentas que hoy deberian publicar: habilitadas en el publicador y sin pausa.
export function publishingAccounts(cuentas: readonly CuentaRow[] | null): CuentaRow[] {
  return (cuentas ?? []).filter((c) => c.habilitada && !c.pausa);
}

export function dailyCap(publicador: Publicador | null, cuentas: readonly CuentaRow[] | null): number {
  const perDay = publicador?.config.por_dia ?? 0;
  const accounts = cuentas ? publishingAccounts(cuentas).length : (publicador?.config.cuentas_habilitadas ?? 0);
  return perDay * accounts;
}

// Respuesta de una linea a "¿esta publicando bien hoy?".
export function publishingVerdict({ publicador, cuentas, today, hour }: VerdictInput): Verdict {
  const reasons: string[] = [];
  const cap = dailyCap(publicador, cuentas);
  const publishers = publishingAccounts(cuentas);
  const offline = publishers.filter((c) => c.estado === "sin_conexion");
  const paused = (cuentas ?? []).filter((c) => c.habilitada && c.pausa);

  if (!publicador) {
    return { tone: "neutral", title: "Sin datos del publicador", reasons: ["NETMAGI no mandó la configuración del publicador."] };
  }
  if (today.restricciones > 0 || (!publicador.config.activo && publicador.config.pausa_motivo)) {
    if (today.restricciones > 0) reasons.push(`Facebook puso ${today.restricciones} restricción(es) hoy. Revisa la cuenta antes de seguir.`);
    if (!publicador.config.activo && publicador.config.pausa_motivo) reasons.push(`Publicador detenido: ${publicador.config.pausa_motivo}`);
    return { tone: "bad", title: "Hay un problema: el publicador está frenado", reasons };
  }
  if (!publicador.config.activo) {
    return { tone: "warn", title: "El publicador está apagado", reasons: ["No se publica hasta que se encienda en la extensión (Publicar > Configuración)."] };
  }
  if (publishers.length === 0) {
    return { tone: "warn", title: "Ninguna cuenta está habilitada para publicar", reasons: ["Habilítalas en la extensión (Publicar > Configuración > Cuentas que publican)."] };
  }
  if (offline.length === publishers.length) {
    return { tone: "bad", title: "Las cuentas que publican están caídas", reasons: [`${offline.map((c) => c.nombre).join(", ")}: sin conexión. Abre el navegador con NETMAGI.`] };
  }

  let tone: Tone = "ok";
  if (offline.length > 0) {
    tone = "warn";
    reasons.push(`Caída: ${offline.map((c) => c.nombre).join(", ")}.`);
  }
  if (paused.length > 0) {
    tone = "warn";
    reasons.push(`En pausa: ${paused.map((c) => c.nombre).join(", ")}.`);
  }
  if (today.fallidos > 0) {
    tone = "warn";
    reasons.push(`${today.fallidos} anuncio(s) fallaron hoy.`);
  }
  if (today.por_verificar > 0) {
    tone = "warn";
    reasons.push(`${today.por_verificar} anuncio(s) por verificar.`);
  }
  const start = publicador.config.hora_inicio;
  const end = publicador.config.hora_fin;
  if (today.publicados === 0 && hour >= start + 2 && hour < end) {
    tone = "warn";
    reasons.push(`Van las ${hour}:00 y todavía no se publica nada hoy.`);
  }
  reasons.push(cap > 0 ? `${today.publicados} de ${cap} publicados hoy.` : `${today.publicados} publicados hoy.`);
  return { tone, title: tone === "ok" ? "Está publicando bien" : "Está publicando, pero revisa esto", reasons };
}

export type TodayCard = {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  compare: string | null; // "Ayer 12 · prom. 7 días 15"
  reached: boolean; // ya igualo o supero a ayer
};

function compareText(trend: Trend): string {
  const avg = trend.avg7 == null ? "—" : String(trend.avg7).replace(".", ",");
  return `Ayer ${trend.yesterday} · prom. 7 días ${avg}`;
}

export type CardsInput = {
  resumen: Resumen;
  cuentas: CuentaRow[] | null;
  publicador: Publicador | null;
  today: string; // 'YYYY-MM-DD' Bogota
  hour: number;
};

export function buildTodayCards({ resumen, cuentas, publicador, today, hour }: CardsInput): { cards: TodayCard[]; verdict: Verdict } {
  const row = resumen.serie.find((day) => day.dia === today) ?? ZERO_DAY(today);
  const verdict = publishingVerdict({ publicador, cuentas, today: row, hour });
  const cap = dailyCap(publicador, cuentas);
  const trend = (key: NumericDayKey) => trendOf(resumen.serie, key, today);

  // Cuentas vivas = con latido reciente (en Messenger o conectadas fuera de el). Del estado fresco de `cuentas`
  // (1 min); si falta, del resumen.
  const alive = cuentas ? cuentas.filter((c) => c.estado !== "sin_conexion").length : resumen.cuentas.en_vivo + resumen.cuentas.fuera;
  const total = cuentas ? cuentas.length : resumen.cuentas.total;
  const publishers = publishingAccounts(cuentas);
  const offlinePublishers = publishers.filter((c) => c.estado === "sin_conexion").length;
  const activeButOffline = (cuentas ?? []).filter((c) => !c.habilitada && c.estado === "sin_conexion" && (c.entrantes_hoy > 0 || c.clientes_7d > 0)).length;
  let accountsTone: Tone = "ok";
  if (alive === 0 || (publishers.length > 0 && offlinePublishers === publishers.length)) accountsTone = "bad";
  else if (offlinePublishers > 0 || activeButOffline > 0) accountsTone = "warn";

  const published = trend("publicados");
  const renewed = trend("renovadas");
  const messages = trend("entrantes");
  const clients = trend("clientes_nuevos");
  const whatsapp = trend("whatsapp");
  const restrictions = trend("restricciones");

  const cards: TodayCard[] = [
    {
      key: "publicados",
      label: "Publicados hoy",
      value: String(published.today),
      sub: cap > 0 ? `de ${cap} posibles hoy (tope)` : "Ninguna cuenta con tope hoy",
      tone: verdict.tone === "neutral" ? "neutral" : verdict.tone,
      compare: compareText(published),
      reached: published.reachedYesterday,
    },
    {
      key: "renovados",
      label: "Renovados hoy",
      value: String(renewed.today),
      sub: row.renovadas > 0 || renewed.avg7 ? "publicaciones renovadas" : "Sin renovaciones todavía",
      tone: "neutral",
      compare: compareText(renewed),
      reached: renewed.reachedYesterday,
    },
    {
      key: "mensajes",
      label: "Mensajes hoy",
      value: String(messages.today),
      sub: "de compradores",
      tone: "neutral",
      compare: compareText(messages),
      reached: messages.reachedYesterday,
    },
    {
      key: "clientes",
      label: "Clientes nuevos hoy",
      value: String(clients.today),
      sub: "chats nuevos de Marketplace",
      tone: "neutral",
      compare: compareText(clients),
      reached: clients.reachedYesterday,
    },
    {
      key: "whatsapp",
      label: "Pases a WhatsApp hoy",
      value: String(whatsapp.today),
      sub: "clientes que pasaron a WhatsApp",
      tone: "neutral",
      compare: compareText(whatsapp),
      reached: whatsapp.reachedYesterday,
    },
    {
      key: "cuentas",
      label: "Cuentas vivas",
      value: `${alive} / ${total}`,
      sub:
        publishers.length > 0
          ? `${publishers.length - offlinePublishers} de ${publishers.length} que publican`
          : "Ninguna publica",
      tone: accountsTone,
      compare: null,
      reached: false,
    },
    {
      key: "restricciones",
      label: "Restricciones hoy",
      value: String(restrictions.today),
      sub: restrictions.today > 0 ? "Facebook frenó una cuenta" : "Sin restricciones",
      tone: restrictions.today > 0 ? "bad" : "ok",
      compare: restrictions.avg7 ? compareText(restrictions) : null,
      reached: false,
    },
  ];
  return { cards, verdict };
}

// ── Cuentas ────────────────────────────────────────────────────────────────────
export const LIVE_LABEL: Readonly<Record<CuentaRow["estado"], string>> = {
  en_vivo: "En vivo",
  fuera: "Conectada (fuera de Messenger)",
  sin_conexion: "Caída",
};

export type AccountView = {
  id: string;
  nombre: string;
  estado: CuentaRow["estado"];
  estadoTexto: string;
  latido: string; // "hace 3 min"
  publica: boolean;
  pausa: string;
  publicadosHoy: number | null; // null = NETMAGI aun no manda el dato
  tope: number;
  mensajesHoy: number | null;
  clientes7d: number | null;
  ubicacion: string;
  activa: boolean; // tuvo actividad reciente o publica
};

export function buildAccountViews(cuentas: readonly CuentaRow[], publicador: Publicador | null, nowIso: string): AccountView[] {
  const perDay = publicador?.config.por_dia ?? 0;
  const rank = (c: AccountView) => (c.publica ? 0 : 2) + (c.estado === "sin_conexion" ? 1 : 0);
  return cuentas
    .map((c): AccountView => {
      const publica = c.habilitada && !c.pausa;
      return {
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        estadoTexto: LIVE_LABEL[c.estado],
        latido: agoText(c.ultimo_latido, nowIso),
        publica,
        pausa: c.pausa,
        publicadosHoy: c.tieneHoy ? c.publicados_hoy : null,
        tope: publica ? (c.tope_diario || perDay) : 0,
        mensajesHoy: c.tieneHoy ? c.entrantes_hoy : null,
        clientes7d: c.tieneHoy ? c.clientes_7d : null,
        ubicacion: c.ubicacion,
        activa: publica || c.estado !== "sin_conexion" || c.entrantes_hoy > 0 || c.clientes_7d > 0 || c.publicados_7d > 0,
      };
    })
    .sort((a, b) => rank(a) - rank(b) || (b.clientes7d ?? 0) - (a.clientes7d ?? 0) || a.nombre.localeCompare(b.nombre, "es"));
}

// ── Anuncios ───────────────────────────────────────────────────────────────────
export type AnuncioFilters = { desde: string; hasta: string; cuenta: string; ciudad: string; estado: string; q: string };

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function filterAnuncios(rows: readonly AnuncioRow[], filters: AnuncioFilters): AnuncioRow[] {
  const q = fold(filters.q);
  return rows
    .filter((row) => {
      if (filters.desde && row.dia < filters.desde) return false;
      if (filters.hasta && row.dia > filters.hasta) return false;
      if (filters.cuenta && row.cuenta_id !== filters.cuenta) return false;
      if (filters.ciudad && row.ciudad !== filters.ciudad) return false;
      if (filters.estado && row.estado !== filters.estado) return false;
      if (q && !fold(`${row.codigo ?? ""} ${row.producto}`).includes(q)) return false;
      return true;
    })
    .sort((a, b) => (b.publicado_at ?? b.dia).localeCompare(a.publicado_at ?? a.dia) || b.id.localeCompare(a.id));
}

export type CityRow = {
  ciudad: string;
  anuncios: number;
  publicados: number;
  por_verificar: number;
  fallidos: number;
  chats: number;
  whatsapp: number;
  estimadas: number;
  cuentas: number;
};

export function groupByCity(rows: readonly AnuncioRow[]): CityRow[] {
  const map = new Map<string, CityRow & { accounts: Set<string> }>();
  for (const row of rows) {
    const entry = map.get(row.ciudad) ?? {
      ciudad: row.ciudad,
      anuncios: 0,
      publicados: 0,
      por_verificar: 0,
      fallidos: 0,
      chats: 0,
      whatsapp: 0,
      estimadas: 0,
      cuentas: 0,
      accounts: new Set<string>(),
    };
    entry.anuncios += 1;
    if (row.estado === "publicado") entry.publicados += 1;
    else if (row.estado === "por_verificar") entry.por_verificar += 1;
    else if (row.estado === "fallido") entry.fallidos += 1;
    entry.chats += row.chats;
    entry.whatsapp += row.whatsapp;
    if (row.ubicacion_estimada) entry.estimadas += 1;
    entry.accounts.add(row.cuenta_id);
    map.set(row.ciudad, entry);
  }
  return [...map.values()]
    .map(({ accounts, ...city }) => ({ ...city, cuentas: accounts.size }))
    .sort((a, b) => b.publicados - a.publicados || b.chats - a.chats || a.ciudad.localeCompare(b.ciudad, "es"));
}

export type AnuncioCsvRow = {
  fecha: string;
  hora: string;
  cuenta: string;
  ciudad: string;
  ubicacion: string;
  ubicacion_estimada: string;
  codigo: string;
  producto: string;
  precio: number;
  estado: string;
  clientes: number;
  enlace: string;
};

export const ANUNCIO_CSV_COLUMNS: { key: keyof AnuncioCsvRow; label: string }[] = [
  { key: "fecha", label: "Fecha" },
  { key: "hora", label: "Hora" },
  { key: "cuenta", label: "Cuenta" },
  { key: "ciudad", label: "Ciudad" },
  { key: "ubicacion", label: "Ubicación" },
  { key: "ubicacion_estimada", label: "Ubicación estimada" },
  { key: "codigo", label: "Código" },
  { key: "producto", label: "Producto" },
  { key: "precio", label: "Precio" },
  { key: "estado", label: "Estado" },
  { key: "clientes", label: "Clientes atribuidos" },
  { key: "enlace", label: "Enlace de Facebook" },
];

export function toCsvRows(rows: readonly AnuncioRow[], stateLabel: Readonly<Record<string, string>>): AnuncioCsvRow[] {
  return rows.map((row) => {
    const time = row.publicado_at ? Date.parse(row.publicado_at) : NaN;
    const local = Number.isFinite(time) ? new Date(time - BOGOTA_OFFSET_MS).toISOString() : "";
    return {
      fecha: row.dia,
      hora: local ? local.slice(11, 16) : "",
      cuenta: row.cuenta,
      ciudad: row.ciudad,
      ubicacion: row.ubicacion,
      ubicacion_estimada: row.ubicacion_estimada ? "sí" : "no",
      codigo: row.codigo ?? "",
      producto: row.producto,
      precio: row.precio,
      estado: stateLabel[row.estado] ?? row.estado,
      clientes: row.chats,
      enlace: row.url ?? "",
    };
  });
}

// ── Grafico de 30 dias ──────────────────────────────────────────────────────────
export type ChartPoint = { dia: string; label: string; publicados: number; clientes_nuevos: number };

export function buildChart(serie: readonly DayRow[], days = 30): { points: ChartPoint[]; startLabel: string | null } {
  const slice = serie.slice(-days);
  const points = slice.map((row) => ({
    dia: row.dia,
    label: shortDayLabel(row.dia),
    publicados: row.publicados,
    clientes_nuevos: row.clientes_nuevos,
  }));
  const hasStart = slice.some((row) => row.dia === PUBLISHER_START);
  return { points, startLabel: hasStart ? shortDayLabel(PUBLISHER_START) : null };
}
