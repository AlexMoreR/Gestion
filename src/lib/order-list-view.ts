// Reglas de la lista de Órdenes (solo cómo se ve y en qué orden; no cambia ningún estado ni dinero).
import { peorDe, type EstadoEntrega, type SeguimientoOrden } from "./delivery-tracking";

export type AlertaOrden = { parte: "Entrega" | "Fabricación"; estado: EstadoEntrega };

type OrdenLista = {
  kind: "order" | "purchase";
  status: string;
  orderDateISO: string;
  seguimiento: SeguimientoOrden | null;
};

const CERRADA = new Set(["COMPLETED", "CANCELLED"]);
export const ordenCerrada = (status: string) => CERRADA.has(status);

// Todas las alertas de la orden (cada despacho y cada OF), la más urgente primero.
export function alertasDeOrden(seguimiento: SeguimientoOrden | null): AlertaOrden[] {
  const todas: AlertaOrden[] = [
    ...(seguimiento?.entrega?.detalles ?? []).map((estado) => ({ parte: "Entrega" as const, estado })),
    ...(seguimiento?.fabricacion?.detalles ?? []).map((estado) => ({ parte: "Fabricación" as const, estado })),
  ];
  const restantes = [...todas];
  const ordenadas: AlertaOrden[] = [];
  while (restantes.length > 0) {
    const peor = peorDe(restantes.map((alerta) => alerta.estado))!.peor;
    const indice = restantes.findIndex((alerta) => alerta.estado === peor);
    ordenadas.push(restantes.splice(indice, 1)[0]);
  }
  return ordenadas;
}

export const alertaPrincipal = (seguimiento: SeguimientoOrden | null): AlertaOrden | null =>
  alertasDeOrden(seguimiento)[0] ?? null;

// "Vence hoy o mañana": aún sin entregar, no atrasada, y la fecha es hoy o mañana (Colombia).
export function venceHoyOManana(alerta: AlertaOrden | null): boolean {
  if (!alerta) return false;
  const { tipo, diasRestantes } = alerta.estado;
  if (tipo === "ATRASADO" || tipo === "ENTREGADO_A_TIEMPO" || tipo === "ENTREGADO_TARDE") return false;
  return diasRestantes === 0 || diasRestantes === 1;
}

export type VistaOrdenes = "ATRASADAS" | "LISTAS" | "VENCEN" | "PRODUCCION";

export function coincideVista(orden: OrdenLista, vista: VistaOrdenes): boolean {
  if (ordenCerrada(orden.status)) return false;
  const alerta = alertaPrincipal(orden.seguimiento);
  if (vista === "ATRASADAS") return alerta?.estado.tipo === "ATRASADO";
  if (vista === "LISTAS") return orden.status === "READY_FOR_DISPATCH";
  if (vista === "VENCEN") return venceHoyOManana(alerta);
  return orden.status === "IN_PRODUCTION";
}

// 0 atrasadas, 1 listas para despacho, 2 vencen pronto, 3 demás abiertas, 4 cerradas.
export function grupoUrgencia(orden: OrdenLista): number {
  if (ordenCerrada(orden.status)) return 4;
  const alerta = alertaPrincipal(orden.seguimiento);
  if (alerta?.estado.tipo === "ATRASADO") return 0;
  if (orden.status === "READY_FOR_DISPATCH") return 1;
  if (alerta?.estado.tipo === "POR_VENCER" || venceHoyOManana(alerta)) return 2;
  return 3;
}

// Orden por defecto: por grupo; atrasadas de más atraso arriba; las que vencen, la más cercana; luego la más nueva.
export function compararPorUrgencia(a: OrdenLista, b: OrdenLista): number {
  const ga = grupoUrgencia(a);
  const gb = grupoUrgencia(b);
  if (ga !== gb) return ga - gb;
  const ea = alertaPrincipal(a.seguimiento)?.estado;
  const eb = alertaPrincipal(b.seguimiento)?.estado;
  if (ga === 0 && ea && eb && ea.atrasoHoras !== eb.atrasoHoras) return eb.atrasoHoras - ea.atrasoHoras;
  if (ga === 2 && ea?.diasRestantes != null && eb?.diasRestantes != null && ea.diasRestantes !== eb.diasRestantes) {
    return ea.diasRestantes - eb.diasRestantes;
  }
  return b.orderDateISO.localeCompare(a.orderDateISO);
}

export type ResponsableEtapa = { nombre: string; rol: "Proveedora" | "Transportadora" | "Asignada" };

// Quién debe mover la orden: en producción la proveedora de la OF abierta; despachada, la transportadora;
// si no, la persona asignada. null = nadie (se muestra "Sin asignar"). Cerradas: nadie la tiene que mover.
export function responsableDeEtapa(orden: {
  status: string;
  asignada: string | null;
  proveedoras: string[];
  transportadoras: string[];
}): ResponsableEtapa | null {
  if (orden.status === "IN_PRODUCTION" && orden.proveedoras.length > 0) {
    return { nombre: orden.proveedoras.join(", "), rol: "Proveedora" };
  }
  if (orden.status === "DISPATCHED" && orden.transportadoras.length > 0) {
    return { nombre: orden.transportadoras.join(", "), rol: "Transportadora" };
  }
  return orden.asignada ? { nombre: orden.asignada, rol: "Asignada" } : null;
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

// "carolina clavijo" → "Carolina Clavijo" (solo para mostrar; el dato guardado no cambia).
export function nombrePropio(nombre: string): string {
  return nombre
    .replace(/[‎‏​]/g, "")
    .trim()
    .split(/\s+/)
    .map((palabra, indice) => {
      const minuscula = palabra.toLocaleLowerCase("es-CO");
      if (indice > 0 && MINUSCULAS.has(minuscula)) return minuscula;
      if (palabra.includes("@")) return palabra;
      return minuscula.charAt(0).toLocaleUpperCase("es-CO") + minuscula.slice(1);
    })
    .join(" ");
}
