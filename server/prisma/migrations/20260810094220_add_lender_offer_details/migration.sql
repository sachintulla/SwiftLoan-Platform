-- AlterTable
ALTER TABLE "LenderPartner" ADD COLUMN     "apiConfig" JSONB,
ADD COLUMN     "disbursalTimeHrs" INTEGER,
ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "maxAmount" INTEGER,
ADD COLUMN     "minAmount" INTEGER,
ADD COLUMN     "processingFeePercent" DOUBLE PRECISION,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'mock',
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "rbiApproved" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "gstOnProcessingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netDisbursalAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processingFeeAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OfferEmiOption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "monthlyEmi" INTEGER NOT NULL,
    "totalInterestPayable" INTEGER NOT NULL,
    "totalRepaymentAmount" INTEGER NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OfferEmiOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferEmiOption_offerId_idx" ON "OfferEmiOption"("offerId");

-- AddForeignKey
ALTER TABLE "OfferEmiOption" ADD CONSTRAINT "OfferEmiOption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

