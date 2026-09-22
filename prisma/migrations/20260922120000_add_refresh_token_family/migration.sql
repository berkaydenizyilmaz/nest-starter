-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_usedAt_idx" ON "RefreshToken"("sessionId", "usedAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the live and the last rotated token of every session over, so open
-- sessions keep working and a replay of the rotated one is still caught.
INSERT INTO "RefreshToken" ("id", "tokenHash", "sessionId", "usedAt", "createdAt")
SELECT gen_random_uuid()::text, "tokenHash", "id", NULL, COALESCE("rotatedAt", "createdAt")
FROM "Session";

INSERT INTO "RefreshToken" ("id", "tokenHash", "sessionId", "usedAt", "createdAt")
SELECT gen_random_uuid()::text, "previousHash", "id", "rotatedAt", "createdAt"
FROM "Session"
WHERE "previousHash" IS NOT NULL;

-- DropIndex
DROP INDEX "Session_previousHash_key";

-- DropIndex
DROP INDEX "Session_tokenHash_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "previousHash",
DROP COLUMN "rotatedAt",
DROP COLUMN "tokenHash";
