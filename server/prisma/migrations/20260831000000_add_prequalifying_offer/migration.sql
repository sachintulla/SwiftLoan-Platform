-- CreateTable
CREATE TABLE "PrequalifyingOffer" (
    "id" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'account_balance',
    "badge" TEXT,
    "amount" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "processingFeePercent" DOUBLE PRECISION,
    "redirectionUrl" TEXT,
    "terms" TEXT,
    "validTill" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrequalifyingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrequalifyingOffer_active_displayOrder_idx" ON "PrequalifyingOffer"("active", "displayOrder");

