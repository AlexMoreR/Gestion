import { describe, expect, it } from "vitest";

import {
  bogotaDay,
  bogotaRange,
  csvCell,
  formatBogotaDateTime,
  marketplaceSales,
  parseCuentas,
  parseProductos,
  parsePublicador,
  parseResumen,
  resolveRangeDays,
  sortRows,
  toChartDays,
  toCsv,
} from "./marketplace-stats";

describe("rango en hora Bogota", () => {
  it("solo acepta 7, 30 o 90 dias (30 por defecto)", () => {
    expect(resolveRangeDays("7")).toBe(7);
    expect(resolveRangeDays(["90"])).toBe(90);
    expect(resolveRangeDays("15")).toBe(30);
    expect(resolveRangeDays(undefined)).toBe(30);
  });

  it("usa el dia de Bogota, no el UTC", () => {
    // 23-oct 03:00 UTC = 22-oct 22:00 en Bogota.
    const range = bogotaRange(7, new Date("2026-10-23T03:00:00Z"));
    expect(range).toMatchObject({ desde: "2026-10-16", hasta: "2026-10-22", days: 7 });
    expect(range.from.toISOString()).toBe("2026-10-16T05:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-23T05:00:00.000Z");
    expect(bogotaDay(new Date("2026-10-23T04:59:00Z"))).toBe("2026-10-22");
    expect(formatBogotaDateTime("2026-10-23T15:04:00Z")).toBe("23/10 10:04");
    expect(formatBogotaDateTime(null)).toBe("—");
  });
});

describe("lectura defensiva de NETMAGI", () => {
  it("resumen: numeros validos, dias validos, el resto en 0", () => {
    const r = parseResumen({
      ok: true,
      desde: "2026-10-01",
      hasta: "2026-10-02",
      totales: { entrantes: "5", whatsapp: 2, pct_whatsapp: 40, clientes_nuevos: 5 },
      cuentas: { total: 14, en_vivo: 7, sin_conexion: 7 },
      serie: [{ dia: "2026-10-01", entrantes: 3, whatsapp: "x" }, { dia: "malo", entrantes: 99 }, null],
    });
    expect(r?.totales.entrantes).toBe(5);
    expect(r?.totales.respuestas).toBe(0);
    expect(r?.cuentas).toEqual({ total: 14, en_vivo: 7, fuera: 0, sin_conexion: 7 });
    expect(r?.serie).toHaveLength(1);
    expect(r?.serie[0]).toMatchObject({ dia: "2026-10-01", entrantes: 3, whatsapp: 0, publicados: 0 });
    expect(parseResumen({ ok: false })).toBeNull();
    expect(parseResumen("<html>")).toBeNull();
  });

  it("cuentas y productos: solo los campos conocidos", () => {
    const cuentas = parseCuentas({
      ok: true,
      cuentas: [{ id: "3", nombre: "Lennis", estado: "raro", entrantes: 4, device: "D-1", codigo: "LIC", ultima_renovacion: { resultado: "OK", cantidad: 12 } }],
    });
    expect(cuentas?.[0]).toMatchObject({ id: "3", nombre: "Lennis", estado: "sin_conexion", entrantes: 4, ultima_renovacion: "OK · 12" });
    expect(JSON.stringify(cuentas)).not.toContain("LIC");
    expect(JSON.stringify(cuentas)).not.toContain("D-1");

    const productos = parseProductos({ ok: true, productos: [{ producto: "Camilla", codigo: "CAV003", chats: 4 }, { producto: "", codigo: "drop table" }] });
    expect(productos?.[0]).toMatchObject({ producto: "Camilla", codigo: "CAV003", chats: 4, whatsapp: 0 });
    expect(productos?.[1]).toMatchObject({ producto: "(sin producto)", codigo: null });
  });

  it("publicador: config resumida y listas acotadas", () => {
    const p = parsePublicador({
      ok: true,
      config: { activo: true, por_dia: 3, openai: "sk-1" },
      hoy: { fecha: "2026-10-23", por_estado: { aprobado: 2 }, cola: [{ hora: "2026-10-23T14:00:00Z", estado: "aprobado", producto: "Silla" }] },
      ultimos: Array.from({ length: 50 }, () => ({ ts: "2026-10-23T14:00:00Z", resultado: "publicado", modo: "auto" })),
    });
    expect(p?.config.activo).toBe(true);
    expect(JSON.stringify(p)).not.toContain("sk-1");
    expect(p?.hoy.cola[0]).toMatchObject({ estado: "aprobado", producto: "Silla" });
    expect(p?.ultimos).toHaveLength(30);
    expect(p?.ultimos[0]).toMatchObject({ estado: "publicado", modo: "auto" });
    expect(p?.inventario).toEqual({ productos: 0, con_fotos_validas: 0, con_codigo_gestion: 0 });
  });
});

describe("ventas del canal Marketplace", () => {
  const range = bogotaRange(7, new Date("2026-10-23T03:00:00Z"));
  const sales = [
    { recognizedAt: new Date("2026-10-20T15:00:00Z"), amount: 1_000_000, profit: 300_000, origin: "MARKETPLACE" },
    { recognizedAt: new Date("2026-10-17T02:00:00Z"), amount: 500_000, profit: 100_000, origin: "MARKETPLACE" }, // 16-oct en Bogota
    { recognizedAt: new Date("2026-10-20T15:00:00Z"), amount: 900_000, profit: 200_000, origin: "META_ADS" },
    { recognizedAt: new Date("2026-10-20T15:00:00Z"), amount: 900_000, profit: 200_000, origin: null },
    { recognizedAt: new Date("2026-10-23T06:00:00Z"), amount: 700_000, profit: 100_000, origin: "MARKETPLACE" }, // fuera del rango
  ];

  it("solo MARKETPLACE, dentro del rango, por dia de Bogota", () => {
    const channel = marketplaceSales(sales, range, 40);
    expect(channel).toEqual({
      count: 2,
      revenue: 1_500_000,
      profit: 400_000,
      byDay: { "2026-10-20": 1, "2026-10-16": 1 },
      closeRatePct: 5,
    });
    expect(marketplaceSales(sales, range, 0).closeRatePct).toBeNull();
  });

  it("serie del grafico con ventas y fallidos + restricciones", () => {
    const days = toChartDays(
      [{ dia: "2026-10-20", entrantes: 5, respuestas: 4, whatsapp: 2, clientes_nuevos: 3, seguimientos: 0, sin_respuesta: 0, renovadas: 0, publicados: 1, fallidos: 1, por_verificar: 0, restricciones: 1 }],
      { "2026-10-20": 1 },
    );
    expect(days[0]).toMatchObject({ dia: "2026-10-20", label: "20 oct", entrantes: 5, fallidos: 2, ventas: 1 });
  });
});

describe("tablas y CSV", () => {
  it("ordena numeros, texto y deja vacios al final", () => {
    const rows = [
      { n: "b", v: 2, c: null as string | null },
      { n: "a", v: 10, c: "X" },
      { n: "c", v: 1, c: "A" },
    ];
    expect(sortRows(rows, "v", "desc").map((r) => r.v)).toEqual([10, 2, 1]);
    expect(sortRows(rows, "n", "asc").map((r) => r.n)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, "c", "asc").map((r) => r.c)).toEqual(["A", "X", null]);
    expect(rows[0].n).toBe("b"); // no muta
  });

  it("CSV con comillas, BOM y sin formulas", () => {
    expect(csvCell('Silla "Roma", negra')).toBe('"Silla ""Roma"", negra"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(true)).toBe("si");
    expect(csvCell(null)).toBe("");
    const csv = toCsv(
      [
        { key: "producto", label: "Producto" },
        { key: "chats", label: "Chats" },
      ],
      [{ producto: "Camilla", chats: 3 }],
    );
    expect(csv).toBe("﻿Producto,Chats\r\nCamilla,3\r\n");
  });
});
