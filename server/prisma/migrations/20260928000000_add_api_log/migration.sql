-- CreateEnum
CREATE TYPE "ApiLogDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "ApiLogDirection" NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" INTEGER,
    "durationMs" INTEGER,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_target_createdAt_idx" ON "ApiLog"("target", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_direction_createdAt_idx" ON "ApiLog"("direction", "createdAt");
