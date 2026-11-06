import { describe, expect, it } from "vitest";
import { estadoDeEntrega } from "./delivery-tracking";
import { parseColombiaDateTime } from "./colombia-time";

const d = (iso: string) => new Date(iso);
const H = 60 * 60 * 1000;
const estimado = d("2026-11-21T00:00:00.000Z"); // 20-nov 7:00 p. m. Colombia
const mas = (ms: number) => new Date(estimado.getTime() + ms);
const estado = (o: { realEn?: Date | null; estimadoEn?: Date | null; enCamino?: boolean }, ahora: Date) =>
  estadoDeEntrega(
    { estimadoEn: o.estimadoEn === undefined ? estimado : o.estimadoEn, realEn: o.realEn ?? null, enCamino: o.enCamino ?? false },
    ahora,
  );

describe("estadoDeEntrega", () => {
  it("entregado a tiempo: real igual o antes del estimado", () => {
    expect(estado({ realEn: estimado }, mas(10 * H)).tipo).toBe("ENTREGADO_A_TIEMPO");
    expect(estado({ realEn: mas(-H) }, mas(10 * H)).tipo).toBe("ENTREGADO_A_TIEMPO");
  });

  it("entregado tarde: horas de atraso hacia abajo", () => {
    expect(estado({ realEn: mas(5.5 * H) }, mas(10 * H))).toEqual({
      tipo: "ENTREGADO_TARDE",
      etiqueta: "Entregado tarde",
      atrasoHoras: 5,
    });
  });

  it("con real y sin estimado, o sin estimado: SIN_FECHA", () => {
    expect(estado({ estimadoEn: null, realEn: estimado }, estimado).tipo).toBe("SIN_FECHA");
    expect(estado({ estimadoEn: null }, estimado)).toEqual({ tipo: "SIN_FECHA", etiqueta: "Sin fecha", atrasoHoras: 0 });
  });

  it("exactamente a la hora estimada aún no está atrasado", () => {
    expect(estado({}, estimado).tipo).toBe("POR_VENCER");
    expect(estado({ enCamino: true }, estimado).tipo).toBe("EN_CAMINO");
  });

  it("atrasado: mínimo 1 h, horas bajo 24 y días desde 24", () => {
    expect(estado({}, mas(30 * 60 * 1000))).toEqual({ tipo: "ATRASADO", etiqueta: "ATRASADO 1 h", atrasoHoras: 1 });
    expect(estado({}, mas(23.9 * H)).etiqueta).toBe("ATRASADO 23 h");
    expect(estado({}, mas(24 * H)).etiqueta).toBe("ATRASADO 1 día");
    expect(estado({}, mas(50 * H))).toEqual({ tipo: "ATRASADO", etiqueta: "ATRASADO 2 días", atrasoHoras: 50 });
  });

  it("atrasado gana a en camino", () => {
    expect(estado({ enCamino: true }, mas(2 * H)).tipo).toBe("ATRASADO");
  });

  it("por vencer con menos de 24 h; a tiempo con exactamente 24 h o más", () => {
    expect(estado({}, mas(-23.9 * H)).tipo).toBe("POR_VENCER");
    expect(estado({}, mas(-24 * H))).toEqual({ tipo: "A_TIEMPO", etiqueta: "A tiempo", atrasoHoras: 0 });
    expect(estado({ enCamino: true }, mas(-48 * H)).tipo).toBe("EN_CAMINO");
  });

  it("19:00 Colombia escrita en el formulario se compara como momento real", () => {
    const desdeFormulario = parseColombiaDateTime("2026-11-20T19:00");
    expect(desdeFormulario?.getTime()).toBe(estimado.getTime());
    // 6:59 p. m. del 20-nov: falta 1 min → por vencer; 7:01 p. m.: atrasado.
    expect(estado({ estimadoEn: desdeFormulario }, d("2026-11-20T23:59:00Z")).tipo).toBe("POR_VENCER");
    expect(estado({ estimadoEn: desdeFormulario }, d("2026-11-21T00:01:00Z")).tipo).toBe("ATRASADO");
  });
});
