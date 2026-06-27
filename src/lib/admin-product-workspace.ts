import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";

export type ProductWorkspaceRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  suppliers: Array<{
    supplierId: string;
    supplierCost: number | null;
  }>;
  isBundle: boolean;
  components: Array<{
    childId: string;
    quantity: number;
  }>;
  thumbnailUrl: string;
  imageUrls: string[];
  baseCost: number;
  additionalCost: number;
  retailMarginPct: number;
  wholesaleMarginPct: number;
  minWholesaleQty: number;
  minStock: number;
  price: number;
  wholesalePrice: number;
};

export type ProductWorkspaceOption = {
  id: string;
  name: string;
};

export type BundleProductOption = {
  id: string;
  name: string;
  code: string | null;
  price: number;
};

export type ProductWorkspaceData = {
  products: ProductWorkspaceRow[];
  categories: ProductWorkspaceOption[];
  suppliers: ProductWorkspaceOption[];
  bundleProducts: BundleProductOption[];
};

/**
 * Datos completos del producto que necesita el modal de edicion (EditProductForm).
 * Compartido entre la pagina de Productos y la de Inventario para no duplicar la query.
 */
export async function getProductWorkspaceData(): Promise<ProductWorkspaceData> {
  const [products, categories, suppliers] = await Promise.all([
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        images: {
          orderBy: { order: "asc" },
        },
        suppliers: {
          orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
          include: { supplier: true },
        },
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const bundleProducts: BundleProductOption[] = products
    .filter((product) => !product.isBundle)
    .map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      price: Number(product.price),
    }));

  return {
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      supplierId: product.suppliers[0]?.supplier.id ?? null,
      supplierName: product.suppliers[0]?.supplier.name ?? null,
      suppliers: product.suppliers.map((supplier) => ({
        supplierId: supplier.supplierId,
        supplierCost: supplier.supplierCost === null ? null : Number(supplier.supplierCost),
      })),
      isBundle: product.isBundle,
      components: product.bundleComponents.map((component) => ({
        childId: component.childId,
        quantity: component.quantity,
      })),
      thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
      imageUrls: product.images.map((image) => getPublicAssetUrl(image.url)),
      baseCost: Number(product.baseCost),
      additionalCost: Number(product.additionalCost),
      retailMarginPct: Number(product.retailMarginPct),
      wholesaleMarginPct: Number(product.wholesaleMarginPct),
      minWholesaleQty: product.minWholesaleQty,
      minStock: product.minStock,
      price: Number(product.price),
      wholesalePrice: Number(product.wholesalePrice),
    })),
    categories: categories.map((category) => ({ id: category.id, name: category.name })),
    suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
    bundleProducts,
  };
}
