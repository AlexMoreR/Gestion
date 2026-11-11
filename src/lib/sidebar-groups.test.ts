import { describe, expect, it } from "vitest";
import { agruparMenu } from "./sidebar-groups";

const grupos = [
  { urls: ["/admin"] },
  { title: "Ventas", urls: ["/admin/cotizaciones", "/admin/ventas", "/admin/clientes"] },
  { title: "Operación", urls: ["/admin/ordenes", "/admin/inventario"] },
  { title: "Finanzas", urls: ["/admin/balances", "/admin/gastos"] },
];
const op = (url: string) => ({ url });

describe("agruparMenu", () => {
  it("con 6 opciones o menos todo va suelto, en el orden de los grupos", () => {
    const items = ["/admin/ordenes", "/admin/ventas", "/admin", "/admin/cotizaciones"].map(op);
    expect(agruparMenu(items, grupos)).toEqual([
      { items: ["/admin", "/admin/cotizaciones", "/admin/ventas", "/admin/ordenes"].map(op) },
    ]);
  });

  it("con más de 6, en grupos; el grupo de una sola opción va suelto", () => {
    const items = ["/admin", "/admin/cotizaciones", "/admin/ventas", "/admin/clientes", "/admin/ordenes", "/admin/inventario", "/admin/gastos"].map(op);
    const secciones = agruparMenu(items, grupos);
    expect(secciones.map((s) => [s.title ?? "suelto", s.items.length])).toEqual([
      ["suelto", 1],
      ["Ventas", 3],
      ["Operación", 2],
      ["suelto", 1],
    ]);
    expect(secciones[3].items).toEqual([op("/admin/gastos")]);
  });
});
