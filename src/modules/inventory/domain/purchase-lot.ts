// Compra por lote a proveedora: reglas puras de las unidades (tabla CompraUnidad).
// Una unidad PENDIENTE o FABRICANDO todavía no está en el inventario.

export const LOT_UNIT_STATES = ["PENDIENTE", "FABRICANDO", "EN_INVENTARIO", "VENDIDA"] as const;
export type LotUnitState = (typeof LOT_UNIT_STATES)[number];

export const LOT_LOCATIONS = ["CALI", "TALLER_PROVEEDORA"] as const;
export type LotLocation = (typeof LOT_LOCATIONS)[number];

export const LOT_LOCATION_LABELS: Record<LotLocation, string> = {
  CALI: "Cali",
  TALLER_PROVEEDORA: "Taller proveedora",
};

const esUbicacion = (valor: string | null | undefined): valor is LotLocation =>
  (LOT_LOCATIONS as readonly string[]).includes(valor ?? "");

/** Reparte una línea comprada: cuántas entran ya al inventario y cuántas quedan pendientes. */
export function splitPurchaseLine(cantidad: number, pendientes: number) {
  if (!Number.isInteger(cantidad) || !Number.isInteger(pendientes)) {
    throw new Error("La cantidad y las pendientes deben ser números enteros");
  }
  if (pendientes < 0 || pendientes > cantidad) {
    throw new Error("Las pendientes deben estar entre 0 y la cantidad comprada");
  }
  return { entranAlInventario: cantidad - pendientes, pendientes };
}

export type LotUnit = { estado: string; ubicacion?: string | null; color?: string | null };
export type LotAction = "fabricar" | "llego" | "ubicacion" | "color" | "vendida";
export type LotActionData = { color?: string | null; ubicacion?: string | null; saleOrderId?: string | null };

/** null si la acción se puede; si no, el motivo en español. */
export function validateLotTransition(unidad: LotUnit, accion: LotAction, datos: LotActionData = {}): string | null {
  const color = datos.color?.trim() ?? "";
  switch (accion) {
    case "fabricar":
      if (unidad.estado !== "PENDIENTE") return "Solo una unidad pendiente se puede pasar a fabricar";
      if (!color) return "Ponle el color antes de pasarla a fabricar";
      return null;
    case "llego":
      if (unidad.estado !== "FABRICANDO") return "Solo una unidad en fabricación puede llegar al inventario";
      if (!esUbicacion(datos.ubicacion)) return "Elige dónde quedó: Cali o Taller proveedora";
      return null;
    case "ubicacion":
      if (unidad.estado !== "EN_INVENTARIO") return "Solo se cambia la ubicación de una unidad en inventario";
      if (!esUbicacion(datos.ubicacion)) return "Elige dónde quedó: Cali o Taller proveedora";
      if (datos.ubicacion === unidad.ubicacion) return "La unidad ya está en esa ubicación";
      return null;
    case "color":
      if (unidad.estado !== "FABRICANDO" && unidad.estado !== "EN_INVENTARIO") {
        return unidad.estado === "PENDIENTE"
          ? "El color se pone al pasarla a fabricar"
          : "No se puede cambiar el color de una unidad vendida";
      }
      if (!color) return "Escribe el color";
      return null;
    case "vendida":
      if (unidad.estado !== "EN_INVENTARIO") return "Solo se vende una unidad que está en inventario";
      if (!datos.saleOrderId) return "Falta la orden de venta";
      return null;
    default:
      return "Acción no válida";
  }
}

/** Cuántas unidades hay en cada lugar o estado. */
export function summarizeLotUnits(unidades: LotUnit[]) {
  const resumen = { cali: 0, taller: 0, fabricando: 0, pendientes: 0, vendidas: 0 };
  for (const u of unidades) {
    if (u.estado === "PENDIENTE") resumen.pendientes += 1;
    else if (u.estado === "FABRICANDO") resumen.fabricando += 1;
    else if (u.estado === "VENDIDA") resumen.vendidas += 1;
    else if (u.estado === "EN_INVENTARIO") {
      if (u.ubicacion === "TALLER_PROVEEDORA") resumen.taller += 1;
      else if (u.ubicacion === "CALI") resumen.cali += 1;
    }
  }
  return resumen;
}
