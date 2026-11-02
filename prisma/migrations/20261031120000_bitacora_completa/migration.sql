BEGIN;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityCode" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "before" JSONB;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "after" JSONB;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "ticket" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "commitSha" TEXT;
CREATE INDEX IF NOT EXISTS "ActivityLog_entityCode_createdAt_idx" ON "ActivityLog"("entityCode","createdAt");
COMMIT;
