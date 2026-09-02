-- AlterTable
ALTER TABLE "User" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_anonymizedAt_deletedAt_idx" ON "User"("anonymizedAt", "deletedAt");
