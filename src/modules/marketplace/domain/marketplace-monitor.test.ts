import { describe, expect, it } from "vitest";

import {
  agoText,
  ANUNCIO_CSV_COLUMNS,
  bogotaDate,
  bogotaHour,
  buildAccountViews,
  buildChart,
  buildTodayCards,
  filterAnuncios,
  groupByCity,
  publishingVerdict,
  toCsvRows,
  trendOf,
} from "./marketplace-monitor";
import {
  AD_STATE_LABEL,
  type AnuncioRow,
  type CuentaRow,
  type DayRow,
  parseAnuncios,
  parseCuentas,
  type Publicador,
  type Resumen,
  toCsv,
} from "./marketplace-stats";

const day = (dia: string, patch: Partial<DayRow> = {}): DayRow => ({
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
  ...patch,
});

// 27-oct 12:00 en Bogota = 17:00 UTC
const NOW = "2026-10-27T17:00:00.000Z";

function serie(): DayRow[] {
  const out: DayRow[] = [];
  for (let d = 1; d <= 27; d += 1) {
    const dia = `2026-10-${String(d).padStart(2, "0")}`;
    out.push(day(dia, { publicados: d === 27 ? 4 : 10, clientes_nuevos: d === 27 ? 5 : 20, entrantes: d === 27 ? 17 : 40, renovadas: 100 }));
  }
  return out;
}

const resumen = (rows: DayRow[]): Resumen => ({
  desde: rows[0].dia,
  hasta: rows[rows.length - 1].dia,
  totales: {} as Resumen["totales"],
  cuentas: { total: 14, en_vivo: 3, fuera: 1, sin_conexion: 10 },
  serie: rows,
});

const cuenta = (patch: Partial<CuentaRow> = {}): CuentaRow => ({
  id: "216",
  nombre: "Paixley",
  estado: "en_vivo",
  ultimo_latido: "2026-10-27T16:59:00.000Z",
  entrantes: 0,
  respuestas: 0,
  whatsapp: 0,
  clientes_nuevos: 0,
  renovadas: 0,
  ultima_renovacion: null,
  publicados: 0,
  fallidos: 0,
  habilitada: true,
  pausa: "",
  tope_diario: 10,
  tieneHoy: true,
  publicados_hoy: 4,
  renovadas_hoy: 0,
  entrantes_hoy: 3,
  restricciones_hoy: 0,
  publicados_7d: 30,
  clientes_7d: 6,
  ubicacion: "Cali",
  ...patch,
});

const publicador = (patch: Partial<Publicador["config"]> = {}): Publicador => ({
  config: {
    activo: true,
    pausa_motivo: "",
    por_dia: 10,
    hora_inicio: 9,
    hora_fin: 18,
    separacion_min: 30,
    dias_sin_repetir: 14,
    aprobacion_manual: false,
    publicar_automatico: true,
    cuentas_habilitadas: 1,
    ...patch,
  },
  hoy: { fecha: "2026-10-27", por_estado: {}, cola: [] },
  periodo: { resultados: {}, publicados_por_modo: {}, fallos_por_campo: {} },
  ultimos: [],
  inventario: { productos: 0, con_fotos_validas: 0, con_codigo_gestion: 0 },
});

describe("tiempo en Bogota", () => {
  it("dia y hora de Bogota, no UTC", () => {
    expect(bogotaDate("2026-10-28T03:00:00Z")).toBe("2026-10-27");
    expect(bogotaHour("2026-10-27T17:00:00Z")).toBe(12);
  });

  it("hace X min / h / dias contra la hora del servidor", () => {
    expect(agoText("2026-10-27T16:59:30Z", NOW)).toBe("hace un momento");
    expect(agoText("2026-10-27T16:50:00Z", NOW)).toBe("hace 10 min");
    expect(agoText("2026-10-27T10:00:00Z", NOW)).toBe("hace 7 h");
    expect(agoText("2026-10-20T17:00:00Z", NOW)).toBe("hace 7 días");
    expect(agoText(null, NOW)).toBe("nunca");
  });
});

describe("hoy contra ayer y promedio de 7 dias", () => {
  it("compara con ayer y con los 7 dias anteriores a hoy", () => {
    const t = trendOf(serie(), "publicados", "2026-10-27");
    expect(t).toEqual({ today: 4, yesterday: 10, avg7: 10, reachedYesterday: false });
  });

  it("avisa solo cuando hoy ya igualo a ayer", () => {
    const rows = serie();
    rows[rows.length - 1].publicados = 11;
    expect(trendOf(rows, "publicados", "2026-10-27").reachedYesterday).toBe(true);
  });

  it("sin dias previos el promedio es null y no revienta", () => {
    expect(trendOf([day("2026-10-27", { publicados: 2 })], "publicados", "2026-10-27")).toEqual({ today: 2, yesterday: 0, avg7: null, reachedYesterday: false });
    expect(trendOf([], "publicados", "2026-10-27").today).toBe(0);
  });
});

describe("¿esta publicando bien hoy?", () => {
  const hoy = (patch: Partial<DayRow> = {}) => day("2026-10-27", { publicados: 4, ...patch });

  it("verde: publica, cuentas conectadas y sin problemas", () => {
    const v = publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy(), hour: 12 });
    expect(v.tone).toBe("ok");
    expect(v.title).toBe("Está publicando bien");
    expect(v.reasons).toContain("4 de 10 publicados hoy.");
  });

  it("rojo: restriccion de Facebook", () => {
    const v = publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ restricciones: 1 }), hour: 12 });
    expect(v.tone).toBe("bad");
    expect(v.reasons[0]).toMatch(/restricci/);
  });

  it("rojo: publicador detenido con motivo", () => {
    const v = publishingVerdict({ publicador: publicador({ activo: false, pausa_motivo: "Detenido: restricción en la cuenta #216" }), cuentas: [cuenta()], today: hoy(), hour: 12 });
    expect(v.tone).toBe("bad");
    expect(v.reasons.join(" ")).toContain("Detenido");
  });

  it("amarillo: publicador apagado sin motivo", () => {
    expect(publishingVerdict({ publicador: publicador({ activo: false }), cuentas: [cuenta()], today: hoy(), hour: 12 }).tone).toBe("warn");
  });

  it("rojo si todas las cuentas que publican estan caidas; amarillo si solo alguna", () => {
    const caida = cuenta({ estado: "sin_conexion" });
    expect(publishingVerdict({ publicador: publicador(), cuentas: [caida], today: hoy(), hour: 12 }).tone).toBe("bad");
    const v = publishingVerdict({ publicador: publicador(), cuentas: [cuenta(), cuenta({ id: "217", nombre: "Otra", estado: "sin_conexion" })], today: hoy(), hour: 12 });
    expect(v.tone).toBe("warn");
    expect(v.reasons.join(" ")).toContain("Otra");
  });

  it("amarillo: fallidos o por verificar, o nada publicado pasadas las 11 en horario", () => {
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ fallidos: 1 }), hour: 12 }).tone).toBe("warn");
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ por_verificar: 2 }), hour: 12 }).tone).toBe("warn");
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ publicados: 0 }), hour: 12 }).tone).toBe("warn");
    // temprano o fuera de horario no es alarma
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ publicados: 0 }), hour: 9 }).tone).toBe("ok");
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta()], today: hoy({ publicados: 0 }), hour: 20 }).tone).toBe("ok");
  });

  it("sin cuentas habilitadas o sin datos del publicador", () => {
    expect(publishingVerdict({ publicador: publicador(), cuentas: [cuenta({ habilitada: false })], today: hoy(), hour: 12 }).tone).toBe("warn");
    expect(publishingVerdict({ publicador: null, cuentas: null, today: hoy(), hour: 12 }).tone).toBe("neutral");
  });
});

describe("tarjetas de hoy", () => {
  it("siete tarjetas con su comparacion y el tope", () => {
    const { cards, verdict } = buildTodayCards({ resumen: resumen(serie()), cuentas: [cuenta(), cuenta({ id: "300", nombre: "Vieja", habilitada: false, estado: "sin_conexion", entrantes_hoy: 0, clientes_7d: 0, publicados_7d: 0 })], publicador: publicador(), today: "2026-10-27", hour: 12 });
    expect(cards.map((c) => c.key)).toEqual(["publicados", "renovados", "mensajes", "clientes", "whatsapp", "cuentas", "restricciones"]);
    const by = Object.fromEntries(cards.map((c) => [c.key, c]));
    expect(by.publicados).toMatchObject({ value: "4", sub: "de 10 posibles hoy (tope)", compare: "Ayer 10 · prom. 7 días 10" });
    expect(by.mensajes.value).toBe("17");
    expect(by.clientes.compare).toBe("Ayer 20 · prom. 7 días 20");
    expect(by.cuentas.value).toBe("1 / 2");
    expect(by.cuentas.tone).toBe("ok");
    expect(by.restricciones).toMatchObject({ value: "0", tone: "ok", sub: "Sin restricciones" });
    expect(verdict.tone).toBe("ok");
  });

  it("restricciones en rojo y cuentas en rojo si ninguna publicadora esta viva", () => {
    const rows = serie();
    rows[rows.length - 1].restricciones = 1;
    const { cards } = buildTodayCards({ resumen: resumen(rows), cuentas: [cuenta({ estado: "sin_conexion" })], publicador: publicador(), today: "2026-10-27", hour: 12 });
    const by = Object.fromEntries(cards.map((c) => [c.key, c]));
    expect(by.restricciones.tone).toBe("bad");
    expect(by.cuentas.tone).toBe("bad");
  });

  it("funciona sin la lista de cuentas (usa el resumen) y sin el publicador", () => {
    const { cards } = buildTodayCards({ resumen: resumen(serie()), cuentas: null, publicador: null, today: "2026-10-27", hour: 12 });
    expect(cards.find((c) => c.key === "cuentas")?.value).toBe("4 / 14");
    expect(cards.find((c) => c.key === "publicados")?.tone).toBe("neutral");
  });
});

describe("cuentas", () => {
  it("las que publican y estan vivas primero; las sin actividad quedan marcadas", () => {
    const views = buildAccountViews(
      [
        cuenta({ id: "1", nombre: "Zeta vieja", habilitada: false, estado: "sin_conexion", entrantes_hoy: 0, clientes_7d: 0, publicados_7d: 0 }),
        cuenta({ id: "2", nombre: "Ana", habilitada: false, estado: "en_vivo", clientes_7d: 20 }),
        cuenta({ id: "3", nombre: "Paixley" }),
      ],
      publicador(),
      NOW,
    );
    expect(views.map((v) => v.id)).toEqual(["3", "2", "1"]);
    expect(views[0]).toMatchObject({ publica: true, tope: 10, publicadosHoy: 4, latido: "hace un momento", estadoTexto: "En vivo" });
    expect(views[1].tope).toBe(0);
    expect(views[2].activa).toBe(false);
  });

  it("si NETMAGI aun no manda los campos de hoy muestra guion y no inventa ceros", () => {
    const [view] = buildAccountViews(parseCuentas({ ok: true, cuentas: [{ id: "1", nombre: "A", estado: "en_vivo", publicador_habilitada: true }] }) ?? [], publicador(), NOW);
    expect(view.publicadosHoy).toBeNull();
    expect(view.mensajesHoy).toBeNull();
    expect(view.clientes7d).toBeNull();
  });
});

const ad = (patch: Partial<AnuncioRow> = {}): AnuncioRow => ({
  id: "1",
  dia: "2026-10-27",
  publicado_at: "2026-10-27T15:00:00.000Z",
  cuenta_id: "216",
  cuenta: "Paixley",
  estado: "publicado",
  codigo: "CAV003",
  producto: "Camilla de masaje 2 cuerpos",
  precio: 450000,
  url: "https://www.facebook.com/marketplace/item/1/",
  ubicacion: "Cali",
  ciudad: "Cali",
  ubicacion_estimada: true,
  chats: 2,
  whatsapp: 1,
  ...patch,
});

describe("anuncios", () => {
  const rows = [
    ad({ id: "1" }),
    ad({ id: "2", dia: "2026-10-26", publicado_at: "2026-10-26T15:00:00.000Z", cuenta_id: "217", cuenta: "Otra", ciudad: "Bogotá", ubicacion: "Bogotá, D.C.", ubicacion_estimada: false, estado: "por_verificar", codigo: "LAV002", producto: "Lavacabezas fibra", chats: 0, whatsapp: 0, url: null }),
    ad({ id: "3", dia: "2026-10-20", publicado_at: "2026-10-20T15:00:00.000Z", estado: "fallido", codigo: "SIL001", producto: "Silla hidráulica" }),
  ];
  const base = { desde: "", hasta: "", cuenta: "", ciudad: "", estado: "", q: "" };

  it("filtra por fecha, cuenta, ciudad, estado y busqueda (sin tildes)", () => {
    expect(filterAnuncios(rows, { ...base, desde: "2026-10-26" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterAnuncios(rows, { ...base, hasta: "2026-10-26" }).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterAnuncios(rows, { ...base, cuenta: "217" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAnuncios(rows, { ...base, ciudad: "Bogotá" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAnuncios(rows, { ...base, estado: "fallido" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterAnuncios(rows, { ...base, q: "cav003" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAnuncios(rows, { ...base, q: "hidraulica" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterAnuncios(rows, { ...base, q: "zzz" })).toEqual([]);
  });

  it("ordena del mas reciente al mas viejo", () => {
    expect(filterAnuncios(rows, base).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("por ciudad suma publicados, clientes y cuantas ciudades se leyeron de Facebook", () => {
    const cities = groupByCity(rows);
    expect(cities[0]).toMatchObject({ ciudad: "Cali", anuncios: 2, publicados: 1, fallidos: 1, chats: 4, estimadas: 2, cuentas: 1 });
    expect(cities[1]).toMatchObject({ ciudad: "Bogotá", por_verificar: 1, estimadas: 0 });
  });

  it("CSV: enlace, ciudad estimada, hora de Bogota y celdas seguras", () => {
    const csv = toCsv(ANUNCIO_CSV_COLUMNS, toCsvRows([ad({ producto: "=SUMA(1)" })], AD_STATE_LABEL));
    const [header, line] = csv.replace("﻿", "").split("\r\n");
    expect(header).toContain("Enlace de Facebook");
    expect(line).toContain("2026-10-27,10:00,Paixley,Cali,Cali,sí,CAV003,'=SUMA(1),450000,Publicado,2,https://www.facebook.com/marketplace/item/1/");
  });
});

describe("lectura de /anuncios de NETMAGI", () => {
  it("solo acepta enlaces de anuncios de Marketplace y campos conocidos", () => {
    const parsed = parseAnuncios({
      ok: true,
      total: 3,
      truncado: false,
      anuncios: [
        { id: "5", dia: "2026-10-27", cuenta_id: "216", cuenta: "P", estado: "publicado", codigo: "CAV003", producto: "X", precio: "450000", url: "https://www.facebook.com/marketplace/item/123/", ubicacion: "Cali", ciudad: "Cali", ubicacion_estimada: false, chats: 2, whatsapp: 1, telefono: "3001112222" },
        { id: "6", dia: "2026-10-27", url: "javascript:alert(1)", codigo: "no-valido" },
        { id: "7", dia: "2026-10-27", url: "https://evil.example.com/marketplace/item/123/" },
        { id: "8", dia: "malo" },
        null,
      ],
    });
    expect(parsed?.total).toBe(3);
    expect(parsed?.anuncios).toHaveLength(3);
    expect(parsed?.anuncios[0]).toMatchObject({ precio: 450000, url: "https://www.facebook.com/marketplace/item/123/", ubicacion_estimada: false });
    expect(parsed?.anuncios[0]).not.toHaveProperty("telefono");
    expect(parsed?.anuncios[1].url).toBeNull();
    expect(parsed?.anuncios[1].codigo).toBeNull();
    expect(parsed?.anuncios[2].url).toBeNull();
    // sin dato de ubicacion se asume estimada (no se afirma que se leyo de Facebook)
    expect(parsed?.anuncios[1].ubicacion_estimada).toBe(true);
    expect(parseAnuncios({ ok: false })).toBeNull();
    expect(parseAnuncios("<html>")).toBeNull();
  });

  it("cuentas: los campos de hoy son opcionales (NETMAGI viejo)", () => {
    const [viejo] = parseCuentas({ ok: true, cuentas: [{ id: "1", nombre: "A" }] }) ?? [];
    expect(viejo.tieneHoy).toBe(false);
    const [nuevo] = parseCuentas({ ok: true, cuentas: [{ id: "1", nombre: "A", publicados_hoy: 3, entrantes_hoy: "7", clientes_7d: 9, ubicacion: "Cali" }] }) ?? [];
    expect(nuevo).toMatchObject({ tieneHoy: true, publicados_hoy: 3, entrantes_hoy: 7, clientes_7d: 9, ubicacion: "Cali" });
  });
});

describe("grafico de 30 dias", () => {
  it("toma los ultimos 30 dias y marca el arranque del publicador (23-oct)", () => {
    const rows: DayRow[] = [];
    for (let i = 0; i < 40; i += 1) {
      rows.push(day(new Date(Date.UTC(2026, 8, 18 + i)).toISOString().slice(0, 10)));
    }
    const { points, startLabel } = buildChart(rows, 30);
    expect(points).toHaveLength(30);
    expect(points[points.length - 1].dia).toBe("2026-10-27");
    expect(startLabel).toBe("23 oct");
  });

  it("sin linea si el rango no incluye el 23-oct", () => {
    const { startLabel } = buildChart([day("2026-10-01"), day("2026-10-02")], 30);
    expect(startLabel).toBeNull();
  });
});
