-- Solo aditiva: índices para consultas frecuentes (tarjeta velocidad)

-- Listas ordenadas por fecha con tope (take 200/500): órdenes, ventas, cotizaciones, despachos, producción.
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX IF NOT EXISTS "Quote_createdAt_idx" ON "Quote"("createdAt");
CREATE INDEX IF NOT EXISTS "Dispatch_createdAt_idx" ON "Dispatch"("createdAt");
CREATE INDEX IF NOT EXISTS "ProductionJob_createdAt_idx" ON "ProductionJob"("createdAt");

-- Clientes (role = CLIENTE) más recientes en Ventas y Cotizaciones (take 400).
CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- Bitácora de un registro (detalle de la orden, historial_de_registro).
CREATE INDEX IF NOT EXISTS "ActivityLog_entityId_idx" ON "ActivityLog"("entityId");
