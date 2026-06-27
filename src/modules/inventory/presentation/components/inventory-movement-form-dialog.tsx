"use client";

import * as React from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
};

type SupplierOption = {
  id: string;
  name: string;
  cost: number | null;
};

type ComboComponentOption = {
  childId: string;
  name: string;
  code: string | null;
  quantity: number;
};

type InventoryMovementFormDialogProps = {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  products: ProductOption[];
  comboComponents: Record<string, ComboComponentOption[]>;
  suppliersByProduct: Record<string, SupplierOption[]>;
  suppliers: { id: string; name: string }[];
  initialProductId?: string | null;
};

export function InventoryMovementFormDialog({
  open,
  onClose,
}: InventoryMovementFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(value) => (value ? null : onClose())}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Nuevo Inventario</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm text-muted-foreground">
            Genera el inventario con Orden de Comprar
          </p>
          <Button
            className="w-full"
            onClick={onClose}
            render={
              <Link href="/admin/ordenes" className="inline-flex items-center justify-center gap-2" />
            }
          >
            <ShoppingCart className="h-4 w-4" />
            Ir a Ordenes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
