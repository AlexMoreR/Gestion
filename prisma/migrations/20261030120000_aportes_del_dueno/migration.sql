-- Aportes del dueno, parte 1 (30-oct-2026). Solo aditiva: un valor nuevo en el enum AccountType.
-- No toca tablas ni columnas. IF NOT EXISTS la deja segura si se corre dos veces (PG 12+).
BEGIN;
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'OWNER';
COMMIT;
