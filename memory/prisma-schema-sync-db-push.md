---
name: prisma-schema-sync-db-push
description: Prisma en Gestion — db push SOLO en local; producción aplica migraciones con migrate deploy (nunca db push)
metadata:
  type: project
---

En el proyecto Gestion hay que distinguir **local** de **producción**:

- **Local (desarrollo):** los cambios de schema se sincronizan con `npx prisma db push`, NO con `npx prisma migrate dev`. `migrate dev` está roto: usa una shadow database que se reconstruye desde cero y revienta al reproducir `20260612140000_add_orders_module` (P3006 / P1014 "The underlying table for model `Sale` does not exist"). Las migraciones se escriben a mano y se commitean.
- **Producción:** SIEMPRE `npx prisma migrate deploy`, NUNCA `db push`. `migrate deploy` no usa shadow DB, solo aplica las migraciones pendientes en orden contra la base real y las registra en `_prisma_migrations`. La DB de producción ya tiene historial sano (verificado 2026-06-22: 31/32 aplicadas).

**Why:** El Dockerfile arrancaba con `npx prisma db push` (corregido 2026-06-22 a `migrate deploy` en [Dockerfile:34]). `db push` se niega a aplicar cambios destructivos (ej. `DROP COLUMN fulfillmentMode`) sin `--accept-data-loss` y bloquea el deploy recurrentemente, además de ignorar las migraciones escritas a mano. `migrate deploy` ejecuta ese DROP porque es SQL explícito de la migración.

**How to apply:** Cambio de schema → editar `prisma/schema.prisma` → `npx prisma format && npx prisma generate` → en local `npx prisma db push` → escribir a mano el archivo en `prisma/migrations/<timestamp>_<nombre>/migration.sql` y commitearlo → producción lo aplica sola en el redeploy vía `migrate deploy`. Verificar con `npx prisma migrate status` (solo lectura) y tipos con `npx tsc --noEmit`. Nunca correr `db push` contra la base de producción: desincroniza `_prisma_migrations`.
