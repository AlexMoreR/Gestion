"use client";

import * as React from "react";
import { Boxes, History, Plus, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  InventoryMetrics,
  InventoryMovementRow,
  ProductStock,
} from "@/modules/inventory/domain/entities";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import {
  adminCreateInventoryMovementAction,
  adminDeleteInventoryMovementAction,
  adminUpdateInventoryMovementAction,
  adminUpdateMinStockAction,
} from "@/app/actions/inventory-actions";
import { ProductStockTable } from "./components/product-stock-table";
import { MovementsTable } from "./components/movements-table";
import { InventoryMovementFormDialog } from "./components/inventory-movement-form-dialog";
import { InventoryMovementEditDialog } from "./components/inventory-movement-edit-dialog";
import { MinStockFormDialog } from "./components/min-stock-form-dialog";
import { ProductEditModal } from "@/components/admin/product-edit-modal";
import type {
  BundleProductOption,
  ProductWorkspaceOption,
  ProductWorkspaceRow,
} from "@/lib/admin-product-workspace";

type InventoryWorkspaceProps = {
  metrics: InventoryMetrics;
  stocks: ProductStock[];
  movements: InventoryMovementRow[];
  suppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]>;
  suppliers: { id: string; name: string }[];
  currency: SupportedCurrencyCode;
  editableProducts: ProductWorkspaceRow[];
  categories: ProductWorkspaceOption[];
  editableSuppliers: ProductWorkspaceOption[];
  bundleProducts: BundleProductOption[];
};

type TabKey = "stock" | "movimientos";

function MetricCard({
  title,
  value,
  accent = "neutral",
}: {
  title: string;
  value: string;
  accent?: "neutral" | "success" | "danger" | "warning" | "info";
}) {
  const toneClass =
    accent === "success"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : accent === "danger"
        ? "border-destructive/20 bg-destructive/5"
        : accent === "warning"
          ? "border-amber-500/20 bg-amber-500/5"
          : accent === "info"
            ? "border-primary/20 bg-primary/5"
            : "border-border bg-card";

  return (
    <Card className={`${toneClass} py-2`}>
      <CardContent className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export function InventoryWorkspace({
  metrics,
  stocks,
  movements,
  suppliersByProduct,
  suppliers,
  currency,
  editableProducts,
  categories,
  editableSuppliers,
  bundleProducts,
}: InventoryWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("stock");
  const [movementModal, setMovementModal] = React.useState<{ open: boolean; productId: string | null }>({
    open: false,
    productId: null,
  });
  const [minStockProduct, setMinStockProduct] = React.useState<ProductStock | null>(null);
  const [editMovement, setEditMovement] = React.useState<InventoryMovementRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<InventoryMovementRow | null>(null);
  const [editProductId, setEditProductId] = React.useState<string | null>(null);

  const editProduct = React.useMemo(
    () => editableProducts.find((product) => product.id === editProductId) ?? null,
    [editableProducts, editProductId],
  );

  const actionsReturnTo = "/admin/inventario";
  const productOptions = React.useMemo(
    () =>
      stocks.map((item) => ({
        id: item.productId,
        name: item.name,
        code: item.code,
        stock: item.stock,
      })),
    [stocks],
  );

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-foreground md:text-xl">
              <Warehouse className="h-4 w-4 text-primary" />
              <span>Inventario</span>
            </h1>

            <Button type="button" onClick={() => setMovementModal({ open: true, productId: null })}>
              <Plus className="h-4 w-4" />
              Nuevo movimiento
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} variant="line">
            <TabsList>
              <TabsTrigger value="stock">
                <Boxes />
                Stock
              </TabsTrigger>
              <TabsTrigger value="movimientos">
                <History />
                Movimientos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Productos en stock"
            value={`${metrics.trackedProducts}`}
            accent="info"
          />
          <MetricCard
            title="Unidades totales"
            value={`${metrics.totalUnits}`}
            accent="neutral"
          />
          <MetricCard
            title="Valor inventario"
            value={formatMoney(metrics.totalValue, currency)}
            accent="neutral"
          />
          <MetricCard
            title="Agotados"
            value={`${metrics.outOfStockCount}`}
            accent={metrics.outOfStockCount > 0 ? "danger" : "neutral"}
          />
        </div>

        {tab === "stock" ? (
          <ProductStockTable
            data={stocks}
            currency={currency}
            onOpenProduct={(productId) => setEditProductId(productId)}
            onMove={(productId) => setMovementModal({ open: true, productId })}
            onEditMin={(productId) => {
              const product = stocks.find((row) => row.productId === productId);
              if (product) {
                setMinStockProduct(product);
              }
            }}
          />
        ) : null}

        {tab === "movimientos" ? (
          <MovementsTable data={movements} onEdit={setEditMovement} onDelete={setPendingDelete} />
        ) : null}
      </section>

      <InventoryMovementFormDialog
        open={movementModal.open}
        action={adminCreateInventoryMovementAction}
        onClose={() => setMovementModal({ open: false, productId: null })}
        returnTo={actionsReturnTo}
        products={productOptions}
        suppliersByProduct={suppliersByProduct}
        suppliers={suppliers}
        initialProductId={movementModal.productId}
      />

      <MinStockFormDialog
        open={Boolean(minStockProduct)}
        action={adminUpdateMinStockAction}
        onClose={() => setMinStockProduct(null)}
        returnTo={actionsReturnTo}
        product={minStockProduct}
      />

      <InventoryMovementEditDialog
        open={Boolean(editMovement)}
        movement={editMovement}
        action={adminUpdateInventoryMovementAction}
        onClose={() => setEditMovement(null)}
        returnTo={actionsReturnTo}
      />

      <ProductEditModal
        product={editProduct}
        categories={categories}
        suppliers={editableSuppliers}
        bundleProducts={bundleProducts}
        currency={currency}
        onClose={() => setEditProductId(null)}
      />

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar movimiento"
          onClick={() => setPendingDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Eliminar movimiento</h3>
              <p className="text-sm text-muted-foreground">
                Se eliminara el movimiento de{" "}
                <span className="font-medium text-foreground">{pendingDelete.productName}</span>. El stock se
                recalcula. Esta accion no se puede deshacer.
              </p>
            </div>
            <form action={adminDeleteInventoryMovementAction} className="mt-5 flex items-center justify-end gap-2">
              <input type="hidden" name="returnTo" value={actionsReturnTo} />
              <input type="hidden" name="movementId" value={pendingDelete.id} />
              <Button type="button" variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-destructive text-white hover:bg-destructive/90">
                Eliminar
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
