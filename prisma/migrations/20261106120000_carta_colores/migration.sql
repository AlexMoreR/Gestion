-- Carta de colores, parte 1 (nov-2026). Solo aditiva: enum y 2 tablas nuevas; deja creados
-- los 4 materiales (sin colores: los carga el equipo) y anota su línea en la bitácora.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ColorGrupo') THEN
        CREATE TYPE "ColorGrupo" AS ENUM ('CUERO', 'TELA');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ColorMaterial" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" "ColorGrupo" NOT NULL,
    "orden" INTEGER NOT NULL,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ColorMaterial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ColorMaterial_nombre_key" ON "ColorMaterial"("nombre");

CREATE TABLE IF NOT EXISTS "CartaColor" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hex" TEXT,
    "fotoUrl" TEXT,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CartaColor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartaColor_materialId_codigo_key" ON "CartaColor"("materialId", "codigo");
CREATE INDEX IF NOT EXISTS "CartaColor_materialId_idx" ON "CartaColor"("materialId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartaColor_materialId_fkey') THEN
        ALTER TABLE "CartaColor" ADD CONSTRAINT "CartaColor_materialId_fkey"
            FOREIGN KEY ("materialId") REFERENCES "ColorMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartaColor_createdById_fkey') THEN
        ALTER TABLE "CartaColor" ADD CONSTRAINT "CartaColor_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Solo los 4 materiales; ids fijos para que repetir la migración no duplique nada.
INSERT INTO "ColorMaterial" ("id", "nombre", "grupo", "orden", "oculto", "createdAt", "updatedAt") VALUES
    ('colmat_cuerotex', 'Cuerotex', 'CUERO', 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('colmat_prana', 'Prana', 'CUERO', 2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('colmat_corsos', 'Corsos', 'CUERO', 3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('colmat_telas', 'Telas', 'TELA', 4, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

-- Firma de la migración (convención del repo): su propia línea en la bitácora.
INSERT INTO "ActivityLog" ("id", "actorId", "actorName", "action", "entityType", "entityId", "summary", "createdAt", "origin", "ticket", "commitSha")
VALUES (
    'migracion-20261106120000-carta-colores', NULL, 'Migración', 'CREATE', 'CARTA_COLORES', NULL,
    'Creó la carta de colores con 4 materiales (Cuerotex, Prana, Corsos, Telas)',
    CURRENT_TIMESTAMP, 'MIGRACION', 'ju1uczt4', NULL
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
