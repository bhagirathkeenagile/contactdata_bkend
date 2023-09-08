/*
  Warnings:

  - The `my_reward_active` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[Name]` on the table `Accounts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "my_reward_active",
ADD COLUMN     "my_reward_active" TEXT;

-- DropEnum
DROP TYPE "RewardStatus";

-- CreateTable
CREATE TABLE "Searches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "accountsId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "contactModule" TEXT NOT NULL,
    "mapsModule" TEXT NOT NULL,
    "accountsModule" TEXT NOT NULL,
    "otherModule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountsId" INTEGER NOT NULL,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_Name_key" ON "Accounts"("Name");

-- AddForeignKey
ALTER TABLE "Searches" ADD CONSTRAINT "Searches_accountsId_fkey" FOREIGN KEY ("accountsId") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roles" ADD CONSTRAINT "Roles_accountsId_fkey" FOREIGN KEY ("accountsId") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
