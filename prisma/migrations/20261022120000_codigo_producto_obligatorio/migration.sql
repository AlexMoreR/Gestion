-- Fase 3 de la sincronizacion Gestion <-> NETMAGI <-> CRM.
-- El codigo del producto pasa a ser obligatorio (ya era unico: "Product_code_key").
-- Verificado el 22-oct-2026 en produccion: 161 productos, 0 nulos, 0 repetidos,
-- todos con formato ^[A-Z]{2,3}[0-9]{3}$.
-- Si algun producto tuviera code NULL esta sentencia falla y la migracion no se aplica.
ALTER TABLE "Product" ALTER COLUMN "code" SET NOT NULL;

-- Preparacion Fase 6 (fotos desde Drive). Columnas nuevas, opcionales, sin datos.
ALTER TABLE "ProductImage" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "origen" TEXT;
