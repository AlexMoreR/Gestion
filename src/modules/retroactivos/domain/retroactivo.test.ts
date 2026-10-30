import { describe, expect, it } from "vitest";
import {
  cambioDeDia,
  diaBogota,
  diasDeAtraso,
  esEdicionRetroactiva,
  esRetroactivo,
  exigirMotivoSiRetroactivo,
  fechaPuestaParaGuardar,
  rangoMesBogota,
  validarMotivo,
} from "./retroactivo";
import { resumirPorPersona } from "./resumen";

// 20-oct-2026 10:00 am en Colombia = 15:00 UTC.
const AHORA = new Date("2026-10-20T15:00:00Z");

describe("diaBogota", () => {
  it("usa el dia de Colombia, no el de UTC", () => {
    // 21-oct 02:00 UTC = 20-oct 9 pm en Colombia.
    expect(diaBogota(new Date("2026-10-21T02:00:00Z"))).toBe("2026-10-20");
    expect(diaBogota(new Date("2026-10-20T05:00:00Z"))).toBe("2026-10-20");
    expect(diaBogota(new Date("2026-10-20T04:59:59Z"))).toBe("2026-10-19");
  });
});

describe("esRetroactivo", () => {
  it("hoy no es retroactivo; ayer si", () => {
    expect(esRetroactivo("2026-10-20", AHORA)).toBe(false);
    expect(esRetroactivo("2026-10-19", AHORA)).toBe(true);
    expect(esRetroactivo("2026-09-30", AHORA)).toBe(true);
  });

  it("una fecha futura no es retroactiva", () => {
    expect(esRetroactivo("2026-10-21", AHORA)).toBe(false);
  });

  it("a las 9 pm de Colombia (ya otro dia en UTC) hoy sigue siendo hoy", () => {
    const noche = new Date("2026-10-21T02:00:00Z");
    expect(esRetroactivo("2026-10-20", noche)).toBe(false);
    expect(esRetroactivo("2026-10-19", noche)).toBe(true);
  });

  it("a las 12:30 am de Colombia, el dia anterior ya es retroactivo", () => {
    const madrugada = new Date("2026-10-21T05:30:00Z");
    expect(esRetroactivo("2026-10-20", madrugada)).toBe(true);
    expect(esRetroactivo("2026-10-21", madrugada)).toBe(false);
  });

  it("acepta Date (dia en Colombia) y descarta vacios o invalidos", () => {
    expect(esRetroactivo(new Date("2026-10-19T12:00:00Z"), AHORA)).toBe(true);
    expect(esRetroactivo(new Date("2026-10-20T12:00:00Z"), AHORA)).toBe(false);
    expect(esRetroactivo(null, AHORA)).toBe(false);
    expect(esRetroactivo("", AHORA)).toBe(false);
    expect(esRetroactivo("ayer", AHORA)).toBe(false);
    expect(esRetroactivo(new Date(NaN), AHORA)).toBe(false);
  });
});

describe("ediciones", () => {
  it("no cuenta como cambio si el dia es el mismo, guardado a medianoche UTC o a mediodia", () => {
    expect(cambioDeDia("2026-10-01", new Date("2026-10-01T00:00:00Z"))).toBe(false);
    expect(cambioDeDia("2026-10-01", new Date("2026-10-01T12:00:00Z"))).toBe(false);
    expect(cambioDeDia("2026-10-01", new Date("2026-10-02T03:00:00Z"))).toBe(false); // 1-oct 10 pm Colombia
    expect(cambioDeDia("2026-10-01", new Date("2026-10-05T12:00:00Z"))).toBe(true);
    expect(cambioDeDia("2026-10-01", null)).toBe(true);
  });

  it("edicion retroactiva = cambia el dia y queda antes de hoy", () => {
    expect(esEdicionRetroactiva("2026-10-10", new Date("2026-10-20T12:00:00Z"), AHORA)).toBe(true);
    expect(esEdicionRetroactiva("2026-10-10", new Date("2026-10-10T00:00:00Z"), AHORA)).toBe(false);
    expect(esEdicionRetroactiva("2026-10-20", new Date("2026-10-10T12:00:00Z"), AHORA)).toBe(false);
    expect(esEdicionRetroactiva(null, new Date(), AHORA)).toBe(false);
  });
});

describe("motivo", () => {
  it("exige motivo solo si es retroactivo", () => {
    expect(exigirMotivoSiRetroactivo(false, undefined)).toEqual({ ok: true, motivo: null });
    expect(exigirMotivoSiRetroactivo(true, undefined).ok).toBe(false);
    expect(exigirMotivoSiRetroactivo(true, "   ").ok).toBe(false);
    expect(exigirMotivoSiRetroactivo(true, "abc").ok).toBe(false);
    expect(exigirMotivoSiRetroactivo(true, "  pago del  sabado ")).toEqual({ ok: true, motivo: "pago del sabado" });
  });

  it("rechaza motivos muy largos o que no son texto", () => {
    expect(validarMotivo("x".repeat(501)).ok).toBe(false);
    expect(validarMotivo(new File(["x"], "a.txt")).ok).toBe(false);
  });
});

describe("puertas: hoy, ayer y medianoche en Bogota", () => {
  it("hoy no pide motivo; ayer sin motivo se rechaza; ayer con motivo de 5 a 500 caracteres pasa", () => {
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-20", AHORA), undefined)).toEqual({ ok: true, motivo: null });
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-19", AHORA), undefined).ok).toBe(false);
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-19", AHORA), "x".repeat(4)).ok).toBe(false);
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-19", AHORA), "x".repeat(5))).toEqual({ ok: true, motivo: "xxxxx" });
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-19", AHORA), "x".repeat(500)).ok).toBe(true);
    expect(exigirMotivoSiRetroactivo(esRetroactivo("2026-10-19", AHORA), "x".repeat(501)).ok).toBe(false);
  });

  it("00:00 Colombia (05:00 UTC) ya es dia nuevo; 23:59 Colombia (04:59 UTC del dia siguiente) sigue en el mismo", () => {
    const medianoche = new Date("2026-10-21T05:00:00Z"); // 21-oct 00:00 en Colombia
    expect(esRetroactivo("2026-10-20", medianoche)).toBe(true);
    expect(esRetroactivo("2026-10-21", medianoche)).toBe(false);
    const casiMedianoche = new Date("2026-10-21T04:59:00Z"); // 20-oct 23:59 en Colombia
    expect(esRetroactivo("2026-10-20", casiMedianoche)).toBe(false);
    expect(esRetroactivo("2026-10-19", casiMedianoche)).toBe(true);
  });

  it("editar un registro viejo sin cambiar de dia no pide motivo", () => {
    const anterior = new Date("2026-10-10T12:00:00Z");
    expect(exigirMotivoSiRetroactivo(esEdicionRetroactiva("2026-10-10", anterior, AHORA), undefined)).toEqual({
      ok: true,
      motivo: null,
    });
    expect(exigirMotivoSiRetroactivo(esEdicionRetroactiva("2026-10-09", anterior, AHORA), undefined).ok).toBe(false);
  });
});

describe("fechas del reporte", () => {
  it("guarda la fecha puesta a mediodia UTC", () => {
    expect(fechaPuestaParaGuardar("2026-10-03").toISOString()).toBe("2026-10-03T12:00:00.000Z");
  });

  it("dias de atraso en dias calendario de Colombia", () => {
    expect(diasDeAtraso("2026-10-17", AHORA)).toBe(3);
    expect(diasDeAtraso(fechaPuestaParaGuardar("2026-10-20"), AHORA)).toBe(0);
    expect(diasDeAtraso("2026-10-19", new Date("2026-10-21T02:00:00Z"))).toBe(1);
  });

  it("rango del mes en hora de Colombia, mes actual por defecto", () => {
    const actual = rangoMesBogota(undefined, AHORA);
    expect(actual.valor).toBe("2026-10");
    expect(actual.desde.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(actual.hasta.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(rangoMesBogota("2026-02", AHORA).valor).toBe("2026-02");
    expect(rangoMesBogota("2026-13", AHORA).valor).toBe("2026-10");
  });
});

describe("resumirPorPersona", () => {
  it("suma por persona y separa por tipo", () => {
    const resumen = resumirPorPersona([
      { usuarioId: "a", tipo: "VENTA", cantidad: 1, monto: 1000 },
      { usuarioId: "b", tipo: "GASTO", cantidad: 3, monto: 50 },
      { usuarioId: "a", tipo: "ABONO", cantidad: 1, monto: 500 },
    ]);
    expect(resumen.map((item) => item.usuarioId)).toEqual(["b", "a"]);
    expect(resumen[1].cantidad).toBe(2);
    expect(resumen[1].porTipo.VENTA).toEqual({ cantidad: 1, monto: 1000 });
    expect(resumen[1].porTipo.ABONO).toEqual({ cantidad: 1, monto: 500 });
    expect(resumen[1].porTipo.GASTO).toEqual({ cantidad: 0, monto: 0 });
  });
});
