import { describe, expect, it } from "vitest";
import type { EstadoEntrega, SeguimientoOrden } from "./delivery-tracking";
import {
  alertaPrincipal,
  alertasDeOrden,
  coincideVista,
  compararPorUrgencia,
  nombrePropio,
  responsableDeEtapa,
  siguienteAccion,
} from "./order-list-view";

const estado = (tipo: EstadoEntrega["tipo"], diasRestantes: number | null, atrasoHoras = 0): EstadoEntrega => ({
  tipo,
  etiqueta: tipo,
  atrasoHoras,
  diasRestantes,
});
const seg = (entrega: EstadoEntrega[], fabricacion: EstadoEntrega[] = []): SeguimientoOrden => ({
  entrega: entrega.length ? { peor: entrega[0], detalles: entrega } : null,
  fabricacion: fabricacion.length ? { peor: fabricacion[0], detalles: fabricacion } : null,
});
const orden = (status: string, seguimiento: SeguimientoOrden | null, fecha = "2026-11-01") => ({
  kind: "order" as const,
  status,
  orderDateISO: `${fecha}T15:00:00.000Z`,
  seguimiento,
});

describe("alertas de la orden", () => {
  it("la principal es la más urgente entre entrega y fabricación", () => {
    const s = seg([estado("A_TIEMPO", 5)], [estado("ATRASADO", -3, 72)]);
    expect(alertaPrincipal(s)?.parte).toBe("Fabricación");
    expect(alertasDeOrden(s).map((a) => a.estado.tipo)).toEqual(["ATRASADO", "A_TIEMPO"]);
  });
  it("sin seguimiento no hay alerta", () => {
    expect(alertaPrincipal(null)).toBeNull();
  });
});

describe("orden por urgencia", () => {
  it("atrasadas (más atraso arriba), listas, vencen pronto, demás abiertas y cerradas al final", () => {
    const cerrada = orden("COMPLETED", null, "2026-11-09");
    const abierta = orden("RELEASED", seg([estado("A_TIEMPO", 6)]));
    const vence = orden("IN_PRODUCTION", seg([], [estado("A_TIEMPO", 1)]));
    const lista = orden("READY_FOR_DISPATCH", null);
    const poco = orden("IN_PRODUCTION", seg([], [estado("ATRASADO", -1, 20)]));
    const mucho = orden("IN_PRODUCTION", seg([], [estado("ATRASADO", -4, 96)]));
    const lista2 = [cerrada, abierta, vence, lista, poco, mucho].sort(compararPorUrgencia);
    expect(lista2).toEqual([mucho, poco, lista, vence, abierta, cerrada]);
  });
});

describe("tarjetas", () => {
  it("una orden cerrada no cuenta en ninguna tarjeta", () => {
    expect(coincideVista(orden("COMPLETED", seg([estado("ATRASADO", -2, 50)])), "ATRASADAS")).toBe(false);
  });
  it("vence hoy o mañana no incluye las atrasadas", () => {
    expect(coincideVista(orden("IN_PRODUCTION", seg([estado("POR_VENCER", 0)])), "VENCEN")).toBe(true);
    expect(coincideVista(orden("IN_PRODUCTION", seg([estado("ATRASADO", 0, 2)])), "VENCEN")).toBe(false);
  });
});

describe("siguiente acción y responsable", () => {
  it("botón según el estado; las compras y las cerradas no llevan", () => {
    expect(siguienteAccion({ kind: "order", status: "READY_FOR_DISPATCH", porFabricar: false })).toBe("Despachar");
    expect(siguienteAccion({ kind: "order", status: "RELEASED", porFabricar: true })).toBe("Fabricar");
    expect(siguienteAccion({ kind: "order", status: "COMPLETED", porFabricar: false })).toBeNull();
    expect(siguienteAccion({ kind: "purchase", status: "RELEASED", porFabricar: false })).toBeNull();
  });
  it("en producción responde la proveedora; si no hay nadie, null", () => {
    const base = { asignada: null, proveedoras: ["Laura"], transportadoras: [] };
    expect(responsableDeEtapa({ ...base, status: "IN_PRODUCTION" })).toEqual({ nombre: "Laura", rol: "Proveedora" });
    expect(responsableDeEtapa({ ...base, status: "READY_FOR_DISPATCH" })).toBeNull();
  });
});

describe("nombrePropio", () => {
  it("mayúscula inicial sin tocar partículas ni correos", () => {
    expect(nombrePropio("carolina clavijo")).toBe("Carolina Clavijo");
    expect(nombrePropio("‎Karen SANDRITH de la Cruz")).toBe("Karen Sandrith de la Cruz");
    expect(nombrePropio("ana@correo.com")).toBe("ana@correo.com");
  });
});
