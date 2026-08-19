-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");