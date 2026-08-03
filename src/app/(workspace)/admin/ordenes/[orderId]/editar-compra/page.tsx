import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PurchaseDirectDialog, type PurchaseLine } from "@/components/admin/purchase-direct-dialog";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getPurchaseFormData } from "@/lib/purchase-form-data";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Separa la nota del item "Color: X · descripcion" en color y descripcion.
function parseItemNotes(notes: string | null): { color: string; description: string } {
  const parts = (notes ?? "")
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  let color = "";
  const descriptionParts: string[] = [];
  for (const part of parts) {
    if (part.toLowerCase().startsWith("color:")) {
      color = part.slice(part.indexOf(":") + 1).trim();
    } else {
      descriptionParts.push(part);
    }
  }
  return { color, description: descriptionParts.join(" · ") };
}

export default async function EditPurchasePage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { orderId } = await params;

  const [order, currency, formData] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            confirmedSupplier: { select: { name: true } },
            photos: { orderBy: { createdAt: "asc" }, take: 1 },
          },
        },
      },
    }),
    getSystemCurrency(),
    getPurchaseFormData(),
  ]);

  if (!order) {
    notFound();
  }
  // Solo compras se editan por aqui. Una orden de venta se redirige a su detalle.
  if (order.type !== "PURCHASE") {
    redirect(`/admin/ordenes/${order.id}`);
  }

  // Reconstruye las lineas de la compra. Los combos quedaron guardados como sus
  // componentes (items sueltos), asi que se editan como productos individuales.
  const lines: PurchaseLine[] = order.items.map((item) => {
    const { color, description } = parseItemNotes(item.notes);
    return {
      uid: item.id,
      productId: item.productId,
      quantity: item.quantity,
      isBundle: false,
      unitCost: Number(item.purchaseCost ?? item.unitPrice),
      supplierId: item.confirmedSupplierId ?? "",
      supplierName: item.confirmedSupplier?.name ?? "",
      color,
      description,
      imageUrl: item.photos[0]?.url ?? "",
      components: [],
    };
  });

  return (
    <PurchaseDirectDialog
      products={formData.purchaseProducts}
      suppliersByProduct={formData.purchaseSuppliersByProduct}
      comboComponents={formData.purchaseComboComponents}
      suppliers={formData.purchaseSuppliers}
      currency={currency}
      editOrder={{
        orderId: order.id,
        code: order.purchaseCode ?? order.code,
        movementDate: toDateInput(order.releasedAt ?? order.createdAt),
        lines,
      }}
    />
  );
}
