-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarFileId" TEXT;

-- CreateIndex
CREATE INDEX "User_avatarFileId_idx" ON "User"("avatarFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

