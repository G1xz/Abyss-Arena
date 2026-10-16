-- CreateEnum
CREATE TYPE "AbyssCycleSource" AS ENUM ('MANUAL', 'WIKI');

-- AlterTable
ALTER TABLE "AbyssChallenge" ADD COLUMN     "enemies" JSONB,
ADD COLUMN     "enemyLevel" INTEGER,
ADD COLUMN     "leyLineDisorder" TEXT,
ADD COLUMN     "leyLineDisorderEn" TEXT,
ADD COLUMN     "target" TEXT;

-- AlterTable
ALTER TABLE "AbyssCycle" ADD COLUMN     "externalKey" TEXT,
ADD COLUMN     "nextKey" TEXT,
ADD COLUMN     "source" "AbyssCycleSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AbyssImage" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbyssImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbyssImage_sourceUrl_key" ON "AbyssImage"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "AbyssCycle_externalKey_key" ON "AbyssCycle"("externalKey");

