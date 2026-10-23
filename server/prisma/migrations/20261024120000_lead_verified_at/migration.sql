-- Mark a website inquiry as verified once its phone completes OTP. Additive.
ALTER TABLE "Lead" ADD COLUMN "verifiedAt" TIMESTAMP(3);
CREATE INDEX "Lead_verifiedAt_idx" ON "Lead"("verifiedAt");
