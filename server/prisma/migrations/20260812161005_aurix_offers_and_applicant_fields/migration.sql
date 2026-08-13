-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "externalPartnerId" TEXT,
ADD COLUMN     "lenderLogoUrl" TEXT,
ADD COLUMN     "lenderName" TEXT,
ADD COLUMN     "offerCode" TEXT,
ADD COLUMN     "offerLikelihood" TEXT,
ADD COLUMN     "offerType" TEXT,
ADD COLUMN     "rawOffer" JSONB,
ADD COLUMN     "redirectionUrl" TEXT,
ADD COLUMN     "roi" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "alternateEmail" TEXT,
ADD COLUMN     "alternateMobile" TEXT,
ADD COLUMN     "aurixToken" TEXT,
ADD COLUMN     "aurixTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "businessEmail" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "loanPurpose" TEXT,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "monthlyObligations" INTEGER,
ADD COLUMN     "professionalType" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "salaryMode" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "PreApprovedPlan" (
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
CREATE INDEX "PreApprovedPlan_active_displayOrder_idx" ON "PreApprovedPlan"("active", "displayOrder");
