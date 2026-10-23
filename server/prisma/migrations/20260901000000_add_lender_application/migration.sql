-- CreateTable
CREATE TABLE "LenderApplication" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "lenderName" TEXT,
    "lenderLogoUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "apr" DOUBLE PRECISION,
    "emi" INTEGER,
    "tenureMonths" INTEGER,
    "processingFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "redirectionUrl" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'handoff',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "underReviewAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "kftApplicationId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LenderApplication_applicationId_idx" ON "LenderApplication"("applicationId");

-- CreateIndex
CREATE INDEX "LenderApplication_offerId_idx" ON "LenderApplication"("offerId");

-- CreateIndex
CREATE INDEX "LenderApplication_kftApplicationId_idx" ON "LenderApplication"("kftApplicationId");

-- AddForeignKey
ALTER TABLE "LenderApplication" ADD CONSTRAINT "LenderApplication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderApplication" ADD CONSTRAINT "LenderApplication_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

