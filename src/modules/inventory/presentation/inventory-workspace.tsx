"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, PackageOpen, History, Layers, PackageX, Plus, Wallet } from "lucide-react";
import { StatList } from "@/components/ui/stat-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  InventoryMetrics,
  InventoryMovementRow,
  ProductStock,
} from "@/modules/inventory/domain/entities";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { comboStock } from "@/lib/combo";
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
import { ProductCostModal } from "@/components/admin/product-cost-modal";
import type {
  BundleProductOption,
  EditableProduct,
  ProductWorkspaceOption,
} from "@/lib/admin-product-workspace";

type InventoryWorkspaceProps = {
  metrics: InventoryMetrics;
  stocks: ProductStock[];
  movements: InventoryMovementRow[];
  suppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]>;
  suppliers: { id: string; name: string }[];
  currency: SupportedCurrencyCode;
  editableProducts: EditableProduct[];
  categories: ProductWorkspaceOption[];
  editableSuppliers: ProductWorkspaceOption[];
};

type TabKey = "stock" | "movimientos";

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
  // Modal de costo/rentabilidad que se abre al hacer clic en un producto del stock.
  const [costProductId, setCostProductId] = React.useState<string | null>(null);

  // Piezas posibles de un combo: se arman aqui para no mandar la lista de productos dos veces.
  const bundleProducts = React.useMemo<BundleProductOption[]>(
    () =>
      editableProducts
        .filter((product) => !product.isBundle)
        .map((product) => ({ id: product.id, name: product.name, code: product.code, price: product.price })),
    [editableProducts],
  );

  const editProduct = React.useMemo(
    () => editableProducts.find((product) => product.id === editProductId) ?? null,
    [editableProducts, editProductId],
  );
  const costProduct = React.useMemo(
    () => stocks.find((row) => row.productId === costProductId) ?? null,
    [stocks, costProductId],
  );

  const actionsReturnTo = "/admin/inventario";
  const productOptions = React.useMemo(() => {
    const base = stocks.map((item) => ({
      id: item.productId,
      name: item.name,
      code: item.code,
      stock: item.stock,
    }));

    // Los combos no manejan stock propio, pero se pueden comprar como unidad:
    // se incluyen en el selector y su "stock" es cuantos se pueden armar con los
    // componentes disponibles. Al registrar la entrada, el stock se reparte a
    // cada componente.
    const stockMap = new Map(stocks.map((item) => [item.productId, item.stock]));
    const combos = editableProducts
      .filter((product) => product.isBundle && product.components.length > 0)
      .map((product) => {
        const buildable = comboStock(
          product.components.map((component) => ({
            childId: component.childId,
            quantity: component.quantity,
            alternates: component.alternateIds.map((productId) => ({ productId })),
          })),
          (productId) => stockMap.get(productId) ?? 0,
        );
        return {
          id: product.id,
          name: `${product.name} (Combo)`,
          code: product.code,
          stock: buildable,
        };
      });

    return [...base, ...combos];
  }, [stocks, editableProducts]);

  // Componentes de cada combo (para mostrar la lista de productos con su precio
  // y proveedor en el formulario de movimiento).
  const comboComponents = React.useMemo(() => {
    const nameByProduct = new Map(
      editableProducts.map((product) => [product.id, { name: product.name, code: product.code }]),
    );
    const map: Record<
      string,
      Array<{ childId: string; name: string; code: string | null; quantity: number }>
    > = {};
    for (const product of editableProducts) {
      if (product.isBundle && product.components.length > 0) {
        map[product.id] = product.components.map((component) => ({
          childId: component.childId,
          quantity: component.quantity,
          name: nameByProduct.get(component.childId)?.name ?? "Producto",
          code: nameByProduct.get(component.childId)?.code ?? null,
        }));
      }
    }
    return map;
  }, [editableProducts]);

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <Button variant="outline" render={<Link href="/admin/inventario/lotes" />}>
              <PackageOpen className="h-4 w-4" />
              Lotes
            </Button>
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

        <StatList
          items={[
            { label: "Productos en stock", value: `${metrics.inStockProducts}`, icon: Boxes, tone: "info" },
            { label: "Unidades totales", value: `${metrics.totalUnits}`, icon: Layers },
            { label: "Valor inventario", value: formatMoney(metrics.totalValue, currency), icon: Wallet },
            {
              label: "Agotados",
              value: `${metrics.outOfStockCount}`,
              icon: PackageX,
              tone: metrics.outOfStockCount > 0 ? "danger" : "neutral",
            },
          ]}
        />

        {tab === "stock" ? (
          <ProductStockTable
            data={stocks}
            currency={currency}
            onOpenProduct={(productId) => setCostProductId(productId)}
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
        comboComponents={comboComponents}
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

      <ProductCostModal
        product={costProduct}
        currency={currency}
        onClose={() => setCostProductId(null)}
        onEdit={(productId) => {
          setCostProductId(null);
          setEditProductId(productId);
        }}
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
          aria-label="Anular movimiento"
          onClick={() => setPendingDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Anular movimiento</h3>
              <p className="text-sm text-muted-foreground">
                Se anulará el movimiento de{" "}
                <span className="font-medium text-foreground">{pendingDelete.productName}</span>. El stock se
                recalcula y queda una copia con el motivo.
              </p>
            </div>
            <form
              // Se cierra después de enviar, para que el aviso (?ok= / ?error=) quede a la vista.
              onSubmit={() => setTimeout(() => setPendingDelete(null))}
              action={adminDeleteInventoryMovementAction} className="mt-5 space-y-4">
              <input type="hidden" name="returnTo" value={actionsReturnTo} />
              <input type="hidden" name="movementId" value={pendingDelete.id} />
              <div className="space-y-1.5">
                <label htmlFor="movement-void-motivo" className="text-sm font-medium text-foreground">
                  Motivo
                </label>
                <Textarea
                  key={pendingDelete.id}
                  id="movement-void-motivo"
                  name="motivo"
                  required
                  minLength={3}
                  maxLength={300}
                  placeholder="Ej.: el movimiento quedó repetido"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                  Volver
                </Button>
                <Button type="submit" size="sm" variant="destructive">
                  Anular movimiento
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
