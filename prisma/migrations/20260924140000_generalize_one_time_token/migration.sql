-- The table becomes one token per user and purpose; keep each user's newest.
DELETE FROM "PasswordResetToken" AS "older"
USING "PasswordResetToken" AS "newer"
WHERE "older"."userId" = "newer"."userId"
  AND ("older"."createdAt", "older"."id") < ("newer"."createdAt", "newer"."id");

-- RenameTable
ALTER TABLE "PasswordResetToken" RENAME TO "OneTimeToken";
ALTER TABLE "OneTimeToken" RENAME CONSTRAINT "PasswordResetToken_pkey" TO "OneTimeToken_pkey";
ALTER TABLE "OneTimeToken" RENAME CONSTRAINT "PasswordResetToken_userId_fkey" TO "OneTimeToken_userId_fkey";
ALTER INDEX "PasswordResetToken_tokenHash_key" RENAME TO "OneTimeToken_tokenHash_key";

-- DropIndex
DROP INDEX "PasswordResetToken_userId_idx";

-- AlterTable
ALTER TABLE "OneTimeToken" RENAME COLUMN "createdAt" TO "issuedAt";
ALTER TABLE "OneTimeToken" ADD COLUMN "purpose" TEXT;
UPDATE "OneTimeToken" SET "purpose" = 'auth.password-reset';
ALTER TABLE "OneTimeToken" ALTER COLUMN "purpose" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeToken_userId_purpose_key" ON "OneTimeToken"("userId", "purpose");
