import { describe, expect, it } from "vitest";
import { estadoDeEntrega, seguimientoDeOrden, PREFIJO_CAMBIO_FECHA, resumenCambioFechaDespacho, resumenCambioFechaOf } from "./delivery-tracking";
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

describe("resúmenes del historial de fechas", () => {
  it("despacho: antes → después en hora Colombia", () => {
    const texto = resumenCambioFechaDespacho("DSP-12", { antes: d("2026-11-05T20:00:00Z"), despues: d("2026-11-07T15:00:00Z") });
    expect(texto).toBe("Cambió la fecha estimada de DSP-12: 2026-11-05 15:00 → 2026-11-07 10:00");
    expect(texto.startsWith(PREFIJO_CAMBIO_FECHA)).toBe(true);
  });

  it("OF: solo lo que cambió y siempre con el mismo prefijo", () => {
    expect(resumenCambioFechaOf("OF-35", { estimada: { antes: null, despues: d("2026-11-21T00:00:00Z") } })).toBe(
      "Cambió la fecha estimada o real de OF-35: estimada sin fecha → 2026-11-20 19:00",
    );
    const ambos = resumenCambioFechaOf("OF-35", {
      estimada: { antes: d("2026-11-21T00:00:00Z"), despues: d("2026-11-22T00:00:00Z") },
      real: { antes: d("2026-11-20T15:00:00Z"), despues: null },
    });
    expect(ambos).toBe(
      "Cambió la fecha estimada o real de OF-35: estimada 2026-11-20 19:00 → 2026-11-21 19:00 · real 2026-11-20 10:00 → sin fecha",
    );
    expect(ambos.startsWith(PREFIJO_CAMBIO_FECHA)).toBe(true);
  });
});

describe("seguimientoDeOrden", () => {
  const ahora = d("2026-11-25T12:00:00Z");
  const base = { orderStatus: "RELEASED", despachos: [], productos: [], ofs: [] };
  const despacho = (o: Partial<{ status: string; estimatedDeliveryAt: Date | null; deliveredAt: Date | null }>) => ({
    status: "PENDING",
    estimatedDeliveryAt: null,
    deliveredAt: null,
    ...o,
  });
  const fab = (supplierId: string, dispatchStatuses: string[] = []) => ({
    confirmedSupplierId: supplierId,
    fulfillmentMode: "MANUFACTURE",
    dispatchStatuses,
  });

  it("sin despachos activos, entrega es null", () => {
    expect(seguimientoDeOrden(base, ahora).entrega).toBeNull();
    const soloMuertos = { ...base, despachos: [despacho({ status: "CANCELLED" }), despacho({ status: "RETURNED" })] };
    expect(seguimientoDeOrden(soloMuertos, ahora).entrega).toBeNull();
  });

  it("con dos atrasados sale el de más horas", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        despachos: [
          despacho({ estimatedDeliveryAt: d("2026-11-25T10:00:00Z") }),
          despacho({ estimatedDeliveryAt: d("2026-11-22T12:00:00Z") }),
          despacho({ estimatedDeliveryAt: d("2026-11-30T12:00:00Z") }),
        ],
      },
      ahora,
    );
    expect(r.entrega?.peor).toEqual({ tipo: "ATRASADO", etiqueta: "ATRASADO 3 días", atrasoHoras: 72 });
    expect(r.entrega?.detalles).toHaveLength(3);
  });

  it("orden de gravedad: sin fecha gana a por vencer, y por vencer a entregado", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        despachos: [
          despacho({ estimatedDeliveryAt: d("2026-11-25T20:00:00Z") }),
          despacho({ estimatedDeliveryAt: d("2026-11-24T12:00:00Z"), deliveredAt: d("2026-11-24T10:00:00Z"), status: "DELIVERED" }),
          despacho({}),
        ],
      },
      ahora,
    );
    expect(r.entrega?.peor.tipo).toBe("SIN_FECHA");
    const sinSinFecha = seguimientoDeOrden(
      { ...base, despachos: [despacho({ estimatedDeliveryAt: d("2026-11-25T20:00:00Z") }), despacho({ status: "DELIVERED", estimatedDeliveryAt: ahora, deliveredAt: ahora })] },
      ahora,
    );
    expect(sinSinFecha.entrega?.peor.tipo).toBe("POR_VENCER");
  });

  it("despacho SHIPPED con fecha futura = en camino; entregado sin estimado no cuenta", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        despachos: [
          despacho({ status: "SHIPPED", estimatedDeliveryAt: d("2026-11-30T12:00:00Z") }),
          despacho({ status: "DELIVERED", deliveredAt: d("2026-11-24T12:00:00Z") }),
        ],
      },
      ahora,
    );
    expect(r.entrega?.peor.tipo).toBe("EN_CAMINO");
    expect(r.entrega?.detalles).toHaveLength(1);
  });

  it("proveedora con productos y sin fila OF: fabricación SIN_FECHA", () => {
    const r = seguimientoDeOrden({ ...base, productos: [fab("laura")] }, ahora);
    expect(r.fabricacion?.peor.tipo).toBe("SIN_FECHA");
  });

  it("fila OF de una proveedora sin productos se ignora; los de stock no cuentan", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        productos: [{ confirmedSupplierId: "laura", fulfillmentMode: "STOCK", dispatchStatuses: [] }],
        ofs: [{ supplierId: "laura", estimatedDeliveryAt: d("2026-11-20T12:00:00Z"), receivedAt: null }],
      },
      ahora,
    );
    expect(r.fabricacion).toBeNull();
  });

  it("OF con fecha atrasada y OF recibida tarde: gana el atraso", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        productos: [fab("laura"), fab("ana")],
        ofs: [
          { supplierId: "laura", estimatedDeliveryAt: d("2026-11-24T12:00:00Z"), receivedAt: null },
          { supplierId: "ana", estimatedDeliveryAt: d("2026-11-20T12:00:00Z"), receivedAt: d("2026-11-21T12:00:00Z") },
        ],
      },
      ahora,
    );
    expect(r.fabricacion?.peor).toEqual({ tipo: "ATRASADO", etiqueta: "ATRASADO 1 día", atrasoHoras: 24 });
  });

  it("OF sin fecha con todos sus productos ya despachados no cuenta", () => {
    const despachado = seguimientoDeOrden({ ...base, productos: [fab("laura", ["CANCELLED", "SHIPPED"])] }, ahora);
    expect(despachado.fabricacion).toBeNull();
    const devuelto = seguimientoDeOrden({ ...base, productos: [fab("laura", ["RETURNED"])] }, ahora);
    expect(devuelto.fabricacion?.peor.tipo).toBe("SIN_FECHA");
  });

  it("orden COMPLETED o CANCELLED sin fecha: los dos son null; lo entregado sí cuenta", () => {
    for (const orderStatus of ["COMPLETED", "CANCELLED"]) {
      const r = seguimientoDeOrden(
        {
          orderStatus,
          despachos: [despacho({ status: "DELIVERED", deliveredAt: d("2026-11-24T12:00:00Z") })],
          productos: [fab("laura")],
          ofs: [],
        },
        ahora,
      );
      expect(r).toEqual({ entrega: null, fabricacion: null });
    }
    const vencida = seguimientoDeOrden(
      {
        orderStatus: "COMPLETED",
        despachos: [
          despacho({ estimatedDeliveryAt: d("2026-11-01T12:00:00Z") }),
          despacho({ status: "DELIVERED", estimatedDeliveryAt: d("2026-11-01T12:00:00Z"), deliveredAt: d("2026-11-02T12:00:00Z") }),
        ],
        productos: [],
        ofs: [],
      },
      ahora,
    );
    expect(vencida.entrega?.peor.tipo).toBe("ENTREGADO_TARDE");
  });
});
