-- Per-stage timestamps for a lender application (Offer). Nullable; each is set
-- once, the first time that lender's status reaches the stage.
ALTER TABLE "Offer" ADD COLUMN "underReviewAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "approvedAt"    TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "rejectedAt"    TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "disbursedAt"   TIMESTAMP(3);
