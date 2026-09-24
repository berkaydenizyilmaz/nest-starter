-- CreateEnum
CREATE TYPE "StoredFileStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "StoredFileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "visibility" "StoredFileVisibility" NOT NULL,
    "status" "StoredFileStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "key" TEXT,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "variants" JSONB,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_key_key" ON "StoredFile"("key");

-- CreateIndex
CREATE INDEX "StoredFile_status_createdAt_idx" ON "StoredFile"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_status_readyAt_idx" ON "StoredFile"("status", "readyAt");

-- CreateIndex
CREATE INDEX "StoredFile_ownerId_idx" ON "StoredFile"("ownerId");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

