// "origen_producto" de una venta para el MCP: si salio de stock o por fabricacion con proveedora.
// Solo muestra lo que se marco en la orden (OrderItem.fulfillmentMode); no revisa el inventario.

export type ProductSourceLine = {
  productName: string;
  quantity: number;
  fulfillmentMode: string; // STOCK | MANUFACTURE | MIXED
  supplierId: string | null; // proveedora confirmada
  supplierName: string | null;
};

export type ProductSourceInput = {
  // null = la venta todavia no tiene orden.
  lines: ProductSourceLine[] | null;
  // Ordenes de fabricacion (OF-xxxxx) de la orden: una por proveedora.
  manufacturingOrders: { code: string; supplierId: string }[];
};

export type ProductSource = {
  tipo: "stock" | "fabricacion" | "mixto" | "sin_orden";
  ordenes_fabricacion: { of: string | null; proveedora: string | null; productos: string[] }[];
};

export function describeProductSource(input: ProductSourceInput): ProductSource {
  const lines = input.lines ?? [];
  if (lines.length === 0) return { tipo: "sin_orden", ordenes_fabricacion: [] };

  const nonStock = lines.filter((line) => line.fulfillmentMode !== "STOCK");
  const tipo =
    nonStock.length === 0
      ? "stock"
      : nonStock.length === lines.length && !lines.some((line) => line.fulfillmentMode === "MIXED")
        ? "fabricacion"
        : "mixto";

  // Una entrada por proveedora; las lineas sin proveedora confirmada van juntas con proveedora null.
  const groups = new Map<string | null, ProductSource["ordenes_fabricacion"][number]>();
  for (const line of nonStock) {
    let group = groups.get(line.supplierId);
    if (!group) {
      const of = line.supplierId
        ? (input.manufacturingOrders.find((mo) => mo.supplierId === line.supplierId)?.code ?? null)
        : null;
      group = { of, proveedora: line.supplierId ? line.supplierName : null, productos: [] };
      groups.set(line.supplierId, group);
    }
    group.productos.push(`${line.productName} x${line.quantity}`);
  }

  return { tipo, ordenes_fabricacion: [...groups.values()] };
}
