-- Cuenta "Aportes del dueño" (parte 1): nuevo tipo de cuenta OWNER. Solo aditiva: no toca tablas ni columnas.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'OWNER';
