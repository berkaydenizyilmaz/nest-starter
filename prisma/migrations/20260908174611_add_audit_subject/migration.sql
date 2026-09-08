-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "subjectId" TEXT;

-- Existing rows predate the column. Every event so far was recorded by the same
-- user it concerns, except the ones written without an actor by background jobs.
UPDATE "AuditLog"
SET "subjectId" = COALESCE(
  "actorId",
  CASE WHEN "targetType" = 'User' THEN "targetId" END
);

-- CreateIndex
CREATE INDEX "AuditLog_subjectId_createdAt_idx" ON "AuditLog"("subjectId", "createdAt");
