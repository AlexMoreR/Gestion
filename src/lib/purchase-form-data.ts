import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { comboStock } from "@/lib/combo";
import { createPrismaInventoryRepository } from "@/modules/inventory/infrastructure/prisma-inventory-repository";

// Datos que necesita el formulario de compra directa (crear y editar): catalogo
// de productos comprables, combos con sus componentes y proveedores por producto.
export type PurchaseFormData = {
  purchaseProducts: Array<{
    id: string;
    name: string;
    code: string | null;
    baseCost: number;
    stock: number;
    thumbnailUrl: string;
    isBundle: boolean;
  }>;
  purchaseSuppliersByProduct: Record<string, Array<{ id: string; name: string; cost: number | null }>>;
  purchaseComboComponents: Record<
    string,
    Array<{ childId: string; name: string; code: string | null; quantity: number; thumbnailUrl: string }>
  >;
  purchaseSuppliers: Array<{ id: string; name: string }>;
};

export async function getPurchaseFormData(): Promise<PurchaseFormData> {
  const repository = createPrismaInventoryRepository();
  const [productStocks, bundleProducts, productSupplierRows, allSuppliers] = await Promise.all([
    // Productos que manejan inventario (para la compra directa a proveedor).
    repository.listProductStocks(),
    // Combos: no manejan stock propio, pero se pueden comprar (reparten stock a
    // sus componentes). Se listan aparte porque listProductStocks los excluye.
    prisma.product.findMany({
      where: { isBundle: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        baseCost: true,
        thumbnailUrl: true,
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          select: {
            childId: true,
            quantity: true,
            child: { select: { name: true, code: true, thumbnailUrl: true } },
            alternates: { select: { productId: true } },
          },
        },
      },
    }),
    prisma.productSupplier.findMany({
      where: { supplier: { isActive: true } },
      orderBy: [{ isPreferred: "desc" }, { supplier: { name: "asc" } }],
      select: {
        productId: true,
        supplierCost: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const stockByProduct = new Map(productStocks.map((stock) => [stock.productId, stock.stock]));
  // Stock de un combo: cada pieza suma su stock y el de sus alternas.
  const bundleStock = (components: Parameters<typeof comboStock>[0]): number =>
    comboStock(components, (productId) => stockByProduct.get(productId) ?? 0);

  const purchaseComboComponents: PurchaseFormData["purchaseComboComponents"] = {};
  for (const bundle of bundleProducts) {
    purchaseComboComponents[bundle.id] = bundle.bundleComponents.map((component) => ({
      childId: component.childId,
      name: component.child.name,
      code: component.child.code,
      quantity: component.quantity,
      thumbnailUrl: getPublicAssetUrl(component.child.thumbnailUrl),
    }));
  }

  const purchaseSuppliersByProduct: PurchaseFormData["purchaseSuppliersByProduct"] = {};
  for (const row of productSupplierRows) {
    (purchaseSuppliersByProduct[row.productId] ??= []).push({
      id: row.supplier.id,
      name: row.supplier.name,
      cost: row.supplierCost === null ? null : Number(row.supplierCost),
    });
  }

  const purchaseProducts: PurchaseFormData["purchaseProducts"] = [
    ...productStocks.map((stock) => ({
      id: stock.productId,
      name: stock.name,
      code: stock.code,
      baseCost: stock.baseCost,
      stock: stock.stock,
      thumbnailUrl: getPublicAssetUrl(stock.thumbnailUrl),
      isBundle: false,
    })),
    ...bundleProducts.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      code: bundle.code,
      baseCost: Number(bundle.baseCost),
      stock: bundleStock(bundle.bundleComponents),
      thumbnailUrl: getPublicAssetUrl(bundle.thumbnailUrl),
      isBundle: true,
    })),
  ];

  return { purchaseProducts, purchaseSuppliersByProduct, purchaseComboComponents, purchaseSuppliers: allSuppliers };
}
