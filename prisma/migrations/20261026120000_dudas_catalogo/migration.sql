-- Dudas del catalogo: preguntas sobre productos que responden las asesoras en /dudas con su nombre
-- y un codigo (sin cuenta ni correo). Se migran de la encuesta de claude.ai con scripts/importar-dudas.ts.
-- Migracion SOLO ADITIVA: crea tres tablas nuevas; no cambia ni borra nada existente.

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DudaCatalogo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "grupo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "duda" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "datos" JSONB NOT NULL,
    "opciones" JSONB NOT NULL,
    "links" JSONB NOT NULL,
    "extra" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DudaCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccesoDudas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3),

    CONSTRAINT "AccesoDudas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RespuestaDuda" (
    "id" TEXT NOT NULL,
    "dudaId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "opcionTexto" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL DEFAULT '',
    "nota" TEXT NOT NULL DEFAULT '',
    "autorNombre" TEXT NOT NULL,
    "accesoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaDuda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DudaCatalogo_grupo_orden_idx" ON "DudaCatalogo"("grupo", "orden");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccesoDudas_activo_idx" ON "AccesoDudas"("activo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RespuestaDuda_dudaId_createdAt_idx" ON "RespuestaDuda"("dudaId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RespuestaDuda_createdAt_idx" ON "RespuestaDuda"("createdAt");

-- AddForeignKey (solo entre las tablas nuevas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RespuestaDuda_dudaId_fkey') THEN
    ALTER TABLE "RespuestaDuda" ADD CONSTRAINT "RespuestaDuda_dudaId_fkey"
      FOREIGN KEY ("dudaId") REFERENCES "DudaCatalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey (solo entre las tablas nuevas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RespuestaDuda_accesoId_fkey') THEN
    ALTER TABLE "RespuestaDuda" ADD CONSTRAINT "RespuestaDuda_accesoId_fkey"
      FOREIGN KEY ("accesoId") REFERENCES "AccesoDudas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
