-- CreateTable
CREATE TABLE "PanRecord" (
    "id" TEXT NOT NULL,
    "panHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "aadhaarLinked" BOOLEAN,
    "verifiedAt" TIMESTAMP(3),
    "dataEnc" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "lastAurixCallAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanRecord_panHash_key" ON "PanRecord"("panHash");

-- CreateIndex
CREATE INDEX "PanRecord_ownerUserId_lastAurixCallAt_idx" ON "PanRecord"("ownerUserId", "lastAurixCallAt");

