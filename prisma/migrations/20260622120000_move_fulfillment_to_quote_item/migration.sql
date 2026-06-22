-- El modo de cumplimiento deja de ser un atributo del producto y pasa a decidirse
-- por linea de venta (QuoteItem): "por stock" (STOCK) o "por orden" (MANUFACTURE).

-- Nueva columna en QuoteItem (por defecto STOCK para las cotizaciones existentes).
ALTER TABLE "QuoteItem"
  ADD COLUMN "fulfillmentMode" "ProductFulfillmentMode" NOT NULL DEFAULT 'STOCK';

-- El modo ya no vive en el producto.
ALTER TABLE "Product" DROP COLUMN "fulfillmentMode";

-- Nota: el valor 'MIXED' del enum "ProductFulfillmentMode" se conserva por
-- compatibilidad, pero ya no se usa (toda venta es STOCK u MANUFACTURE).
