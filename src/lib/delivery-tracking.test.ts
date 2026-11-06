import { describe, expect, it } from "vitest";
import {
  estadoDeEntrega,
  seguimientoDeOrden,
  resumirSeguimiento,
  cumplimientoPorProveedor,
  PREFIJO_CAMBIO_FECHA,
  resumenCambioFechaDespacho,
  resumenCambioFechaOf,
  type OrdenParaResumen,
} from "./delivery-tracking";
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
      diasRestantes: null,
    });
  });

  it("con real y sin estimado, o sin estimado: SIN_FECHA", () => {
    expect(estado({ estimadoEn: null, realEn: estimado }, estimado).tipo).toBe("SIN_FECHA");
    expect(estado({ estimadoEn: null }, estimado)).toEqual({ tipo: "SIN_FECHA", etiqueta: "Sin fecha", atrasoHoras: 0, diasRestantes: null });
  });

  it("exactamente a la hora estimada aún no está atrasado", () => {
    expect(estado({}, estimado).tipo).toBe("POR_VENCER");
    expect(estado({ enCamino: true }, estimado).tipo).toBe("EN_CAMINO");
  });

  it("atrasado: horas mínimo 1 y texto por día calendario", () => {
    // Estimado 20-nov 7:00 p. m.; 7:30 p. m. sigue siendo el 20.
    expect(estado({}, mas(30 * 60 * 1000))).toEqual({ tipo: "ATRASADO", etiqueta: "venció hoy", atrasoHoras: 1, diasRestantes: 0 });
    expect(estado({}, mas(23.9 * H))).toMatchObject({ etiqueta: "venció ayer", atrasoHoras: 23 });
    expect(estado({}, mas(50 * H))).toEqual({ tipo: "ATRASADO", etiqueta: "lleva 2 días de atraso", atrasoHoras: 50, diasRestantes: -2 });
  });

  it("atrasado gana a en camino", () => {
    expect(estado({ enCamino: true }, mas(2 * H)).tipo).toBe("ATRASADO");
  });

  it("por vencer con menos de 24 h; a tiempo con exactamente 24 h o más", () => {
    expect(estado({}, mas(-23.9 * H)).tipo).toBe("POR_VENCER");
    expect(estado({}, mas(-24 * H))).toEqual({ tipo: "A_TIEMPO", etiqueta: "vence mañana", atrasoHoras: 0, diasRestantes: 1 });
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

describe("días restantes en el texto del chip", () => {
  // Ahora = 6-nov-2026 10:00 a. m. Colombia.
  const ahora = parseColombiaDateTime("2026-11-06T10:00") as Date;
  const col = (v: string) => parseColombiaDateTime(v) as Date;
  const etiqueta = (estimadoEn: Date | null, en: Date = ahora, enCamino = false) =>
    estadoDeEntrega({ estimadoEn, realEn: null, enCamino }, en).etiqueta;

  it("hoy, mañana, 3 días, vencida el mismo día, ayer, 2 días y sin fecha", () => {
    expect(etiqueta(col("2026-11-06T15:00"))).toBe("vence hoy");
    expect(etiqueta(col("2026-11-07T10:00"))).toBe("vence mañana");
    expect(etiqueta(col("2026-11-09T10:00"))).toBe("quedan 3 días");
    expect(etiqueta(col("2026-11-05T10:00"))).toBe("venció ayer");
    expect(etiqueta(col("2026-11-04T10:00"))).toBe("lleva 2 días de atraso");
    expect(etiqueta(col("2026-11-06T08:00"))).toBe("venció hoy");
    expect(etiqueta(null)).toBe("Sin fecha");
  });

  it("cambio de mes", () => {
    expect(etiqueta(col("2026-12-02T10:00"), col("2026-11-30T10:00"))).toBe("quedan 2 días");
    expect(etiqueta(col("2026-10-31T10:00"), col("2026-11-01T10:00"))).toBe("venció ayer");
  });

  it("7:00 p. m. Colombia (medianoche UTC) es del mismo día", () => {
    expect(etiqueta(d("2026-11-21T00:00:00Z"), col("2026-11-20T10:00"))).toBe("vence hoy");
  });

  it("cuenta días calendario, no horas", () => {
    const e = estadoDeEntrega({ estimadoEn: col("2026-11-07T08:00"), realEn: null, enCamino: false }, col("2026-11-06T23:00"));
    expect(e).toMatchObject({ tipo: "POR_VENCER", etiqueta: "vence mañana", diasRestantes: 1 });
  });

  it("entregados no cambian y en camino suma los días", () => {
    const real = (r: string) => estadoDeEntrega({ estimadoEn: col("2026-11-06T15:00"), realEn: col(r), enCamino: false }, ahora).etiqueta;
    expect(real("2026-11-06T14:00")).toBe("Entregado a tiempo");
    expect(real("2026-11-06T16:00")).toBe("Entregado tarde");
    const camino = estadoDeEntrega({ estimadoEn: col("2026-11-09T10:00"), realEn: null, enCamino: true }, ahora);
    expect(camino).toMatchObject({ tipo: "EN_CAMINO", etiqueta: "En camino · quedan 3 días" });
    expect(estadoDeEntrega({ estimadoEn: col("2026-11-05T10:00"), realEn: null, enCamino: true }, ahora).tipo).toBe("ATRASADO");
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
    expect(r.entrega?.peor).toEqual({ tipo: "ATRASADO", etiqueta: "lleva 3 días de atraso", atrasoHoras: 72, diasRestantes: -3 });
    expect(r.entrega?.detalles).toHaveLength(3);
  });

  it("a igual estado gana la fecha más cercana", () => {
    const r = seguimientoDeOrden(
      {
        ...base,
        despachos: [
          despacho({ estimatedDeliveryAt: d("2026-12-05T12:00:00Z") }),
          despacho({ estimatedDeliveryAt: d("2026-11-28T12:00:00Z") }),
        ],
      },
      ahora,
    );
    expect(r.entrega?.peor).toMatchObject({ tipo: "A_TIEMPO", etiqueta: "quedan 3 días" });
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
    expect(r.fabricacion?.peor).toEqual({ tipo: "ATRASADO", etiqueta: "venció ayer", atrasoHoras: 24, diasRestantes: -1 });
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

describe("resumirSeguimiento", () => {
  const ahora = mas(0);
  const orden = (n: number, o: Partial<OrdenParaResumen> = {}): OrdenParaResumen => ({
    orderId: `o${n}`,
    codigo: `ORD-${n}`,
    cliente: `Cliente ${n}`,
    orderStatus: "RELEASED",
    despachos: [],
    productos: [],
    ofs: [],
    transportadoras: [],
    proveedoras: {},
    ...o,
  });
  const fab = { confirmedSupplierId: "p1", fulfillmentMode: "MANUFACTURE", dispatchStatuses: [] as string[] };

  it("cuenta cada despacho y cada OF por separado: una orden con los dos atrasados suma 2", () => {
    const r = resumirSeguimiento(
      [
        orden(1, {
          despachos: [{ status: "SHIPPED", estimatedDeliveryAt: mas(-5 * H), deliveredAt: null }],
          productos: [fab],
          ofs: [{ supplierId: "p1", estimatedDeliveryAt: mas(-30 * H), receivedAt: null }],
          transportadoras: ["Don Rafa"],
          proveedoras: { p1: "Laura" },
        }),
      ],
      ahora,
    );
    expect(r.atrasados).toBe(2);
    expect(r.pendientes.map((p) => p.que)).toEqual(["OF · Laura", "Despacho · Don Rafa"]);
    expect(r.pendientes[0]).toMatchObject({ orderId: "o1", codigo: "ORD-1", cliente: "Cliente 1", estado: { tipo: "ATRASADO", atrasoHoras: 30 } });
  });

  it("cuenta por vencer, en camino y sin fecha; deja fuera A tiempo y entregados", () => {
    const r = resumirSeguimiento(
      [
        orden(1, {
          despachos: [
            { status: "PENDING", estimatedDeliveryAt: mas(5 * H), deliveredAt: null },
            { status: "SHIPPED", estimatedDeliveryAt: mas(50 * H), deliveredAt: null },
            { status: "PENDING", estimatedDeliveryAt: null, deliveredAt: null },
            { status: "PENDING", estimatedDeliveryAt: mas(80 * H), deliveredAt: null },
            { status: "DELIVERED", estimatedDeliveryAt: mas(-H), deliveredAt: mas(-2 * H) },
            { status: "CANCELLED", estimatedDeliveryAt: mas(-50 * H), deliveredAt: null },
          ],
          transportadoras: [null, "Servientrega", null, null, null, null],
        }),
      ],
      ahora,
    );
    expect(r).toMatchObject({ atrasados: 0, porVencer: 1, enCamino: 1, sinFecha: 1, totalPendientes: 3 });
    expect(r.pendientes.map((p) => [p.estado.tipo, p.que])).toEqual([
      ["POR_VENCER", "Despacho"],
      ["SIN_FECHA", "Despacho"],
      ["EN_CAMINO", "Despacho · Servientrega"],
    ]);
  });

  it("ordena por horas de atraso (más atrasado primero) y corta en 10", () => {
    const ordenes = Array.from({ length: 12 }, (_, i) =>
      orden(i, { despachos: [{ status: "PENDING", estimatedDeliveryAt: mas(-(i + 1) * H), deliveredAt: null }], transportadoras: [null] }),
    );
    const r = resumirSeguimiento(ordenes, ahora);
    expect(r.atrasados).toBe(12);
    expect(r.totalPendientes).toBe(12);
    expect(r.pendientes).toHaveLength(10);
    expect(r.pendientes[0].codigo).toBe("ORD-11");
    const horas = r.pendientes.map((p) => p.estado.atrasoHoras);
    expect(horas).toEqual([...horas].sort((a, b) => b - a));
  });

  it("sin órdenes: todo en cero y lista vacía", () => {
    expect(resumirSeguimiento([], ahora)).toEqual({ atrasados: 0, porVencer: 0, enCamino: 0, sinFecha: 0, totalPendientes: 0, pendientes: [] });
  });
});

describe("cumplimientoPorProveedor", () => {
  const fila = (proveedorId: string, estimadoEn: Date | null, realEn: Date | null, tipo: "FABRICACION" | "TRANSPORTE" = "FABRICACION") => ({
    proveedorId,
    nombre: proveedorId.toUpperCase(),
    tipo,
    estimadoEn,
    realEn,
  });

  it("ignora filas sin estimada o sin real, calcula % y promedia solo las tardías", () => {
    const r = cumplimientoPorProveedor([
      fila("a", estimado, mas(-H)),
      fila("a", estimado, mas(10 * H)),
      fila("a", estimado, mas(20 * H)),
      fila("a", null, mas(H)),
      fila("a", estimado, null),
      fila("b", estimado, estimado),
    ]);
    expect(r).toEqual([
      { proveedorId: "a", nombre: "A", tipo: "FABRICACION", entregas: 3, aTiempo: 1, tarde: 2, cumplimientoPct: 33, atrasoPromedioHoras: 15 },
      { proveedorId: "b", nombre: "B", tipo: "FABRICACION", entregas: 1, aTiempo: 1, tarde: 0, cumplimientoPct: 100, atrasoPromedioHoras: 0 },
    ]);
  });

  it("separa fabricación y transporte del mismo proveedor", () => {
    const r = cumplimientoPorProveedor([fila("a", estimado, estimado), fila("a", estimado, mas(3 * H), "TRANSPORTE")]);
    expect(r.map((x) => [x.tipo, x.cumplimientoPct])).toEqual([
      ["TRANSPORTE", 0],
      ["FABRICACION", 100],
    ]);
  });

  it("sin filas válidas: lista vacía, sin dividir por cero", () => {
    expect(cumplimientoPorProveedor([])).toEqual([]);
    expect(cumplimientoPorProveedor([fila("a", null, estimado), fila("a", estimado, null)])).toEqual([]);
  });
});
