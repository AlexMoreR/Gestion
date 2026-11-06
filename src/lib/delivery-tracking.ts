// Estado de una entrega (despacho) o fabricación (OF) contra su fecha y hora estimada.
// Puro y sin alias "@/" para que Vitest lo resuelva. Compara momentos reales: no usa colombiaDayKey.
import { formatNoteDate } from "./order-notes";

export type TipoEstadoEntrega =
  | "SIN_FECHA"
  | "A_TIEMPO"
  | "POR_VENCER"
  | "ATRASADO"
  | "EN_CAMINO"
  | "ENTREGADO_A_TIEMPO"
  | "ENTREGADO_TARDE";

export type EstadoEntrega = { tipo: TipoEstadoEntrega; etiqueta: string; atrasoHoras: number };

const HORA_MS = 60 * 60 * 1000;

// Horas hacia abajo con mínimo 1, para no mostrar "0 h".
function horasDeAtraso(desde: Date, hasta: Date): number {
  return Math.max(1, Math.floor((hasta.getTime() - desde.getTime()) / HORA_MS));
}

function etiquetaAtraso(horas: number): string {
  if (horas < 24) return `ATRASADO ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `ATRASADO ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function estadoDeEntrega(
  { estimadoEn, realEn, enCamino }: { estimadoEn: Date | null; realEn: Date | null; enCamino: boolean },
  ahora: Date,
): EstadoEntrega {
  if (realEn && estimadoEn) {
    if (realEn.getTime() <= estimadoEn.getTime()) {
      return { tipo: "ENTREGADO_A_TIEMPO", etiqueta: "Entregado a tiempo", atrasoHoras: 0 };
    }
    return { tipo: "ENTREGADO_TARDE", etiqueta: "Entregado tarde", atrasoHoras: horasDeAtraso(estimadoEn, realEn) };
  }
  // Con real y sin estimado tampoco cuenta para cumplimiento.
  if (!estimadoEn) return { tipo: "SIN_FECHA", etiqueta: "Sin fecha", atrasoHoras: 0 };
  // Vencido gana a "en camino": un envío atrasado no se esconde.
  if (ahora.getTime() > estimadoEn.getTime()) {
    const horas = horasDeAtraso(estimadoEn, ahora);
    return { tipo: "ATRASADO", etiqueta: etiquetaAtraso(horas), atrasoHoras: horas };
  }
  if (enCamino) return { tipo: "EN_CAMINO", etiqueta: "En camino", atrasoHoras: 0 };
  if (estimadoEn.getTime() - ahora.getTime() < 24 * HORA_MS) {
    return { tipo: "POR_VENCER", etiqueta: "Por vencer", atrasoHoras: 0 };
  }
  return { tipo: "A_TIEMPO", etiqueta: "A tiempo", atrasoHoras: 0 };
}

// Historial de fechas (despacho y OF): la bitácora se filtra por este prefijo; no hay tabla propia.
export const PREFIJO_CAMBIO_FECHA = "Cambió la fecha estimada";

type CambioFecha = { antes: Date | null; despues: Date | null };

function textoFecha(fecha: Date | null): string {
  return fecha ? formatNoteDate(fecha) : "sin fecha";
}

// "Cambió la fecha estimada de DES-12: 2026-11-05 15:00 → 2026-11-07 10:00" (hora Colombia).
export function resumenCambioFechaDespacho(codigo: string, cambio: CambioFecha): string {
  return `${PREFIJO_CAMBIO_FECHA} de ${codigo}: ${textoFecha(cambio.antes)} → ${textoFecha(cambio.despues)}`;
}

// OF: lleva solo lo que cambió; con "o real" para que el cambio de la fecha real caiga en el mismo historial.
export function resumenCambioFechaOf(codigo: string, { estimada, real }: { estimada?: CambioFecha; real?: CambioFecha }): string {
  const partes: string[] = [];
  if (estimada) partes.push(`estimada ${textoFecha(estimada.antes)} → ${textoFecha(estimada.despues)}`);
  if (real) partes.push(`real ${textoFecha(real.antes)} → ${textoFecha(real.despues)}`);
  return `${PREFIJO_CAMBIO_FECHA} o real de ${codigo}: ${partes.join(" · ")}`;
}

// ---- Seguimiento de una orden en la lista (peor estado de entrega y de fabricación) ----

// De más grave a menos grave; entre dos ATRASADO gana el de más horas.
const GRAVEDAD: TipoEstadoEntrega[] = [
  "ATRASADO",
  "SIN_FECHA",
  "POR_VENCER",
  "EN_CAMINO",
  "A_TIEMPO",
  "ENTREGADO_TARDE",
  "ENTREGADO_A_TIEMPO",
];

export type SeguimientoParte = { peor: EstadoEntrega; detalles: EstadoEntrega[] };
export type SeguimientoOrden = { entrega: SeguimientoParte | null; fabricacion: SeguimientoParte | null };

type SeguimientoEntrada = {
  orderStatus: string;
  despachos: Array<{ status: string; estimatedDeliveryAt: Date | null; deliveredAt: Date | null }>;
  productos: Array<{ confirmedSupplierId: string | null; fulfillmentMode: string; dispatchStatuses: string[] }>;
  ofs: Array<{ supplierId: string; estimatedDeliveryAt: Date | null; receivedAt: Date | null }>;
};

const despachoVivo = (status: string) => status !== "CANCELLED" && status !== "RETURNED";

// Copia de isManufacturingItem (src/lib/manufacturing-orders.ts, que usa Prisma e importa este módulo):
// si esa regla cambia, cambiar también esta.
const esDeFabricacion = (item: { confirmedSupplierId: string | null; fulfillmentMode: string }) =>
  Boolean(item.confirmedSupplierId) && item.fulfillmentMode !== "STOCK";

function peorDe(estados: EstadoEntrega[]): SeguimientoParte | null {
  if (estados.length === 0) return null;
  const peor = estados.reduce((a, b) => {
    const ga = GRAVEDAD.indexOf(a.tipo);
    const gb = GRAVEDAD.indexOf(b.tipo);
    if (ga !== gb) return gb < ga ? b : a;
    return b.atrasoHoras > a.atrasoHoras ? b : a;
  });
  return { peor, detalles: estados };
}

export function seguimientoDeOrden(
  { orderStatus, despachos, productos, ofs }: SeguimientoEntrada,
  ahora: Date,
): SeguimientoOrden {
  // Orden cerrada o cancelada: solo cuenta lo ya terminado, para que el histórico no se llene de alertas.
  const cerrada = orderStatus === "COMPLETED" || orderStatus === "CANCELLED";
  const cuenta = (estado: EstadoEntrega, realEn: Date | null) => {
    if (cerrada) return estado.tipo === "ENTREGADO_A_TIEMPO" || estado.tipo === "ENTREGADO_TARDE";
    // Ya hecho sin fecha estimada: no queda fecha por poner.
    return !(estado.tipo === "SIN_FECHA" && realEn);
  };

  const entregas = despachos
    .filter((despacho) => despachoVivo(despacho.status))
    .map((despacho) => ({
      estado: estadoDeEntrega(
        { estimadoEn: despacho.estimatedDeliveryAt, realEn: despacho.deliveredAt, enCamino: despacho.status === "SHIPPED" },
        ahora,
      ),
      realEn: despacho.deliveredAt,
    }))
    .filter(({ estado, realEn }) => cuenta(estado, realEn))
    .map(({ estado }) => estado);

  // La fila OF solo existe si se abrió la orden de fabricación: se parte de las proveedoras con productos.
  const proveedoras = new Set(
    productos.filter(esDeFabricacion).map((item) => item.confirmedSupplierId as string),
  );
  const fabricaciones: EstadoEntrega[] = [];
  for (const supplierId of proveedoras) {
    const of = ofs.find((fila) => fila.supplierId === supplierId);
    const realEn = of?.receivedAt ?? null;
    const estado = estadoDeEntrega({ estimadoEn: of?.estimatedDeliveryAt ?? null, realEn, enCamino: false }, ahora);
    if (!cuenta(estado, realEn)) continue;
    if (estado.tipo === "SIN_FECHA") {
      const propios = productos.filter((item) => esDeFabricacion(item) && item.confirmedSupplierId === supplierId);
      if (propios.every((item) => item.dispatchStatuses.some(despachoVivo))) continue;
    }
    fabricaciones.push(estado);
  }

  return { entrega: peorDe(entregas), fabricacion: peorDe(fabricaciones) };
}
