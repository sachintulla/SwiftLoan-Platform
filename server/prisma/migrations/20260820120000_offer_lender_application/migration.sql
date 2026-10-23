-- Per-lender application tracking on Offer
ALTER TABLE "Offer" ADD COLUMN "applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "lenderStatus" "ApplicationStatus";
ALTER TABLE "Offer" ADD COLUMN "kftApplicationId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "applicationUrl" TEXT;

-- CreateIndex
CREATE INDEX "Offer_applied_idx" ON "Offer"("applied");
