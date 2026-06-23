-- Porcion del costo de envio asignada a cada producto del despacho (reparte el total).
ALTER TABLE "DispatchItem"
  ADD COLUMN "shippingCost" DECIMAL(12, 2) NOT NULL DEFAULT 0;
