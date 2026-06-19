---
name: prisma-schema-sync-db-push
description: How to apply Prisma schema changes in the Gestion project (use db push, not migrate dev)
metadata:
  type: project
---

En el proyecto Gestion, los cambios de schema de Prisma se aplican con `npx prisma db push`, NO con `npx prisma migrate dev`.

**Why:** El historial de migraciones está roto: la migración `20260612140000_add_orders_module` no se puede reproducir limpiamente en la shadow database (falla con P3006 / P1014 "The underlying table for model `Sale` does not exist"). La base real ya tiene todas las tablas, pero la shadow DB se reconstruye desde cero y revienta.

**How to apply:** Tras editar `prisma/schema.prisma`, correr `npx prisma format && npx prisma generate && npx prisma db push`. db push es no destructivo al añadir tablas/columnas nuevas. Verificar tipos con `npx tsc --noEmit`.
