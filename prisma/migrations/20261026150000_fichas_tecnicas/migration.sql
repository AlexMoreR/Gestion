-- Fichas tecnicas del producto: una ProductImage puede ser "foto" (galeria) o "ficha" (ficha tecnica).
-- Migracion SOLO ADITIVA: agrega una columna con valor por defecto. Todas las filas que ya existen
-- quedan como "foto", asi que la tienda, la portada y la API de catalogo siguen igual.
-- En PostgreSQL 11+ un DEFAULT constante no reescribe la tabla (es instantaneo).
ALTER TABLE "ProductImage" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'foto';
