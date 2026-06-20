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
import {
  adminCreateInventoryMovementAction,
  adminUpdateMinStockAction,
} from "@/app/actions/inventory-actions";
import { ProductStockTable } from "./components/product-stock-table";
import { MovementsTable } from "./components/movements-table";
import { InventoryMovementFormDialog } from "./components/inventory-movement-form-dialog";
import { MinStockFormDialog } from "./components/min-stock-form-dialog";

type InventoryWorkspaceProps = {
  metrics: InventoryMetrics;
  stocks: ProductStock[];
  movements: InventoryMovementRow[];
};

type TabKey = "stock" | "movimientos";

function MetricCard({
  title,
  value,
  helper,
  accent = "neutral",
}: {
  title: string;
  value: string;
  helper: string;
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
        <p className="text-[10px] text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export function InventoryWorkspace({ metrics, stocks, movements }: InventoryWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("stock");
  const [movementModal, setMovementModal] = React.useState<{ open: boolean; productId: string | null }>({
    open: false,
    productId: null,
  });
  const [minStockProduct, setMinStockProduct] = React.useState<ProductStock | null>(null);

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
            helper="Productos tipo Stock"
            accent="info"
          />
          <MetricCard
            title="Unidades totales"
            value={`${metrics.totalUnits}`}
            helper="Suma de existencias"
            accent="neutral"
          />
          <MetricCard
            title="Bajo stock"
            value={`${metrics.lowStockCount}`}
            helper="En o bajo el minimo"
            accent={metrics.lowStockCount > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            title="Agotados"
            value={`${metrics.outOfStockCount}`}
            helper="Sin existencias"
            accent={metrics.outOfStockCount > 0 ? "danger" : "neutral"}
          />
        </div>

        {tab === "stock" ? (
          <ProductStockTable
            data={stocks}
            onMove={(productId) => setMovementModal({ open: true, productId })}
            onEditMin={(productId) => {
              const product = stocks.find((row) => row.productId === productId);
              if (product) {
                setMinStockProduct(product);
              }
            }}
          />
        ) : null}

        {tab === "movimientos" ? <MovementsTable data={movements} /> : null}
      </section>

      <InventoryMovementFormDialog
        open={movementModal.open}
        action={adminCreateInventoryMovementAction}
        onClose={() => setMovementModal({ open: false, productId: null })}
        returnTo={actionsReturnTo}
        products={productOptions}
        initialProductId={movementModal.productId}
      />

      <MinStockFormDialog
        open={Boolean(minStockProduct)}
        action={adminUpdateMinStockAction}
        onClose={() => setMinStockProduct(null)}
        returnTo={actionsReturnTo}
        product={minStockProduct}
      />
    </>
  );
}
