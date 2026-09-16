-- Repair migration: the earlier 20260831000000_add_prequalifying_offer was
-- wrongly marked "applied" without running by the deploy self-heal loop (fixed
-- in deploy.yml), so the table was never created on already-deployed DBs.
-- Idempotent (IF NOT EXISTS) so it is a no-op wherever the table already exists.

CREATE TABLE IF NOT EXISTS "PrequalifyingOffer" (
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

CREATE INDEX IF NOT EXISTS "PrequalifyingOffer_active_displayOrder_idx" ON "PrequalifyingOffer"("active", "displayOrder");
