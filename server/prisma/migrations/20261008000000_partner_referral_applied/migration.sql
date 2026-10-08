-- Add application-tracking columns to PartnerReferral (Yubi/YMPL alt-offers).
ALTER TABLE "PartnerReferral" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "PartnerReferral" ADD COLUMN "appliedLender" TEXT;
ALTER TABLE "PartnerReferral" ADD COLUMN "lastStatus" TEXT;
