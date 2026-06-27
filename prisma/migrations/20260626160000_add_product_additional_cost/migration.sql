-- AlterTable: costo adicional por unidad (flete/transporte) del producto.
-- Costo de compra real = baseCost (proveedor) + additionalCost (flete).
ALTER TABLE "Product" ADD COLUMN "additionalCost" DECIMAL(10,2) NOT NULL DEFAULT 0;
