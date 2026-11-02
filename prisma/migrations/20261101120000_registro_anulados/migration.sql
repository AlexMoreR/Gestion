-- Registro de anulados: lo que tiene plata (abonos y gastos) no se borra sin dejar copia.
-- "Anular" guarda aquí la fila completa con motivo y quién, y luego borra el original.
-- Sin llaves foráneas a propósito (igual que RegistroRetroactivo): la copia queda aunque
-- se borre el usuario o el registro.
-- Migración SOLO ADITIVA: no cambia, reescribe ni borra columnas ni datos existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS "RegistroAnulado" (
    "id" TEXT NOT NULL,
    "tabla" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "codigo" TEXT,
    "monto" DECIMAL(14,2) NOT NULL,
    "datos" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'PANTALLA',
    "anuladoPorId" TEXT NOT NULL,
    "anuladoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAnulado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RegistroAnulado_tabla_registroId_idx" ON "RegistroAnulado"("tabla", "registroId");

CREATE INDEX IF NOT EXISTS "RegistroAnulado_anuladoEn_idx" ON "RegistroAnulado"("anuladoEn");

COMMIT;
