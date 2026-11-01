-- Aportes del dueño, parte 1 (1-nov-2026). Solo aditiva: un valor nuevo en el enum de tipo de cuenta.
BEGIN;
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'OWNER';
COMMIT;
