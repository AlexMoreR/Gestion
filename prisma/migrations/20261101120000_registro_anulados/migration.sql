-- Registro de anulados: lo que tiene plata (abonos, gastos) no se borra a mano, se anula con motivo.
-- Antes de borrar el original se guarda aqui la fila completa (datos), con quien, cuando y por que.
-- Sin llaves foraneas a proposito (igual que RegistroRetroactivo): la copia queda aunque se borre todo lo demas.
-- Migracion SOLO ADITIVA: no cambia, reescribe ni borra columnas ni datos existentes.
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
