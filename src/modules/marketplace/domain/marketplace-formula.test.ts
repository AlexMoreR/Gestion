import { describe, expect, it } from "vitest";

import { formulaVerdict } from "./marketplace-monitor";
import { formulaNoDisponible, parseFormula } from "./marketplace-stats";

const BODY = {
  ok: true,
  disponible: true,
  senal: "clientes",
  estado_ganadora: "provisional",
  ganadora: { variante: "precio", nombre: "Producto + precio", tasa: 2, senal: "clientes", n: 5, ventaja_sobre_base: 100 },
  config: { activo: true, fija: null, epsilon: 0.2, min_anuncios: 5, ventana_dias: 14 },
  variantes: [
    { variante: "precio", nombre: "Producto + precio", anuncios: 5, clics: 0, con_clics: 0, mensajes: 0, con_mensajes: 0, clientes: 10, whatsapp: 2, tasa: 2, suficiente: true, faltan: 0, clientes_por_anuncio: 2 },
    { variante: "gancho", nombre: "Pregunta / gancho", anuncios: 2, clics: 4, con_clics: 2, mensajes: 0, con_mensajes: 0, clientes: 0, whatsapp: 0, tasa: 0, suficiente: false, faltan: 3, clientes_por_anuncio: 0 },
  ],
  faltan_para_confirmar: { anuncios_totales: 3, minimo_por_variante: 5, ventana_dias: 14, variantes: [{ variante: "gancho", nombre: "Pregunta / gancho", tiene: 2, faltan: 3 }] },
  por_categoria: [{ nombre: "Camillas de Masaje", anuncios: 7, clientes: 10, clientes_por_anuncio: 1.43, mejor_variante: "precio" }],
  por_producto: [{ nombre: "Camilla portatil", anuncios: 7, clientes: 10, clientes_por_anuncio: 1.43, mejor_variante: null }],
  por_cuenta: [],
  atribucion: { id: 2, titulo_exacto: 6, titulo_aproximado: 2, total: 10, pct_exacta: 80 },
  metricas_leidas: { confirmadas: false, cuentas: [{ cuenta: "Paixley", ultima_lectura: "2026-10-28T10:00:00Z", anuncios_vistos: 12, con_metricas: 0, restriccion: false }] },
};

describe("lectura defensiva de /formula", () => {
  it("lee variantes, ganadora, faltantes, grupos, atribucion y lectura de Facebook", () => {
    const f = parseFormula(BODY);
    expect(f).not.toBeNull();
    expect(f?.estado).toBe("provisional");
    expect(f?.senal).toBe("clientes");
    expect(f?.ganadora).toMatchObject({ variante: "precio", tasa: 2, ventaja_sobre_base: 100 });
    expect(f?.variantes).toHaveLength(2);
    expect(f?.variantes[1]).toMatchObject({ variante: "gancho", suficiente: false, faltan: 3, con_clics: 2 });
    expect(f?.faltan).toMatchObject({ anuncios_totales: 3, minimo: 5, ventana_dias: 14 });
    expect(f?.porCategoria[0]).toMatchObject({ nombre: "Camillas de Masaje", mejor_variante: "precio" });
    expect(f?.porProducto[0].mejor_variante).toBeNull();
    expect(f?.atribucion).toMatchObject({ id: 2, titulo_exacto: 6, pct_exacta: 80 });
    expect(f?.metricas.confirmadas).toBe(false);
    expect(f?.metricas.cuentas[0]).toMatchObject({ cuenta: "Paixley", anuncios_vistos: 12, con_metricas: 0 });
  });

  it("no confia en la forma: cuerpos invalidos, estado raro y campos que faltan", () => {
    expect(parseFormula(null)).toBeNull();
    expect(parseFormula({ ok: false })).toBeNull();
    expect(parseFormula({ ok: true, variantes: "no" })).toBeNull();
    expect(parseFormula({ ok: true, disponible: false })).toBeNull();
    const f = parseFormula({ ok: true, variantes: [{ variante: "x", anuncios: "7", clientes: "basura" }], estado_ganadora: "inventado", senal: "otra" });
    expect(f?.estado).toBe("sin_datos");
    expect(f?.senal).toBeNull();
    expect(f?.variantes[0]).toMatchObject({ anuncios: 7, clientes: 0, suficiente: false });
    expect(f?.ganadora).toBeNull();
    expect(f?.config.activo).toBe(true);
  });

  it("disponible:false significa que NETMAGI no tiene el calculo (ruta que falta)", () => {
    expect(formulaNoDisponible({ ok: true, disponible: false })).toBe(true);
    expect(formulaNoDisponible(BODY)).toBe(false);
    expect(formulaNoDisponible(null)).toBe(false);
  });
});

describe("titular de «Qué funciona»", () => {
  const base = parseFormula(BODY)!;

  it("provisional: va ganando, con la ventaja, lo que falta y el aviso de que no se leen cifras de Facebook", () => {
    const v = formulaVerdict(base);
    expect(v.tone).toBe("warn");
    expect(v.title).toBe("Va ganando «Producto + precio»: 2 clientes por anuncio (+100 % sobre el título solo)");
    expect(v.reasons.join(" ")).toMatch(/Faltan 3 anuncio\(s\) en total/);
    expect(v.reasons.join(" ")).toMatch(/Aún no se leen clics ni mensajes/);
  });

  it("confirmada: tono ok y 'Gana'", () => {
    const v = formulaVerdict({ ...base, estado: "confirmada", faltan: { ...base.faltan, anuncios_totales: 0 }, metricas: { ...base.metricas, confirmadas: true } });
    expect(v.tone).toBe("ok");
    expect(v.title.startsWith("Gana «Producto + precio»")).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("sin ganadora: tono neutro y sin inventar nada", () => {
    expect(formulaVerdict({ ...base, ganadora: null, estado: "sin_datos" }).title).toMatch(/Todavía no hay datos/);
    expect(formulaVerdict({ ...base, ganadora: null, estado: "falta_comparar" }).tone).toBe("neutral");
    expect(formulaVerdict({ ...base, ganadora: null, estado: "sin_ganadora" }).title).toMatch(/no hay una fórmula ganadora/);
  });

  it("avisa si las fórmulas están apagadas o fijadas a mano", () => {
    expect(formulaVerdict({ ...base, config: { ...base.config, activo: false } }).reasons[0]).toMatch(/apagadas/);
    expect(formulaVerdict({ ...base, config: { ...base.config, fija: "precio" } }).reasons[0]).toMatch(/fijada a mano/);
  });
});
