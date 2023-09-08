-- CreateTable
CREATE TABLE "ContactUploads" (
    "id" SERIAL NOT NULL,
    "filePath" TEXT NOT NULL,
    "mapping" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContactUploads_pkey" PRIMARY KEY ("id")
);
