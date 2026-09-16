-- AlterTable
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "externalPartnerId" TEXT,
ADD COLUMN IF NOT EXISTS "lenderLogoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "lenderName" TEXT,
ADD COLUMN IF NOT EXISTS "offerCode" TEXT,
ADD COLUMN IF NOT EXISTS "offerLikelihood" TEXT,
ADD COLUMN IF NOT EXISTS "offerType" TEXT,
ADD COLUMN IF NOT EXISTS "rawOffer" JSONB,
ADD COLUMN IF NOT EXISTS "redirectionUrl" TEXT,
ADD COLUMN IF NOT EXISTS "roi" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
ADD COLUMN IF NOT EXISTS "alternateEmail" TEXT,
ADD COLUMN IF NOT EXISTS "alternateMobile" TEXT,
ADD COLUMN IF NOT EXISTS "aurixToken" TEXT,
ADD COLUMN IF NOT EXISTS "aurixTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "businessEmail" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "companyEmail" TEXT,
ADD COLUMN IF NOT EXISTS "district" TEXT,
ADD COLUMN IF NOT EXISTS "landmark" TEXT,
ADD COLUMN IF NOT EXISTS "loanPurpose" TEXT,
ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT,
ADD COLUMN IF NOT EXISTS "monthlyObligations" INTEGER,
ADD COLUMN IF NOT EXISTS "professionalType" TEXT,
ADD COLUMN IF NOT EXISTS "qualification" TEXT,
ADD COLUMN IF NOT EXISTS "salaryMode" TEXT,
ADD COLUMN IF NOT EXISTS "state" TEXT;

-- CreateTable
-- IF NOT EXISTS: PreApprovedPlan predates the migrations (created via db push on
-- existing DBs), so it must be a no-op there while still being created on a
-- fresh database. Without this, `migrate deploy` fails with 42P07 on dev/prod.
CREATE TABLE IF NOT EXISTS "PreApprovedPlan" (
    "id" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'account_balance',
    "exploreUrl" TEXT,
    "badge" TEXT,
    "maxAmount" INTEGER,
    "amountAtApproval" BOOLEAN NOT NULL DEFAULT false,
    "rateMin" DOUBLE PRECISION,
    "rateMax" DOUBLE PRECISION,
    "rateAtApproval" BOOLEAN NOT NULL DEFAULT false,
    "tenureMinMonths" INTEGER,
    "tenureMaxMonths" INTEGER,
    "tags" TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreApprovedPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PreApprovedPlan_active_displayOrder_idx" ON "PreApprovedPlan"("active", "displayOrder");
