/*
  Warnings:

  - The `AccountId` column on the `Contact` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `ContactUploads` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "AccountId",
ADD COLUMN     "AccountId" INTEGER;

-- DropTable
DROP TABLE "ContactUploads";

-- CreateTable
CREATE TABLE "MappingData" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mainTable" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mapping" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MappingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jobs" (
    "id" SERIAL NOT NULL,
    "mapId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_AccountId_fkey" FOREIGN KEY ("AccountId") REFERENCES "Accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
