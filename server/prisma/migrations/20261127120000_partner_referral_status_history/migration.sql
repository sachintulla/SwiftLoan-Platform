-- Yubi (YMPL) referral: keep the provider's full answer and every status it went through.
-- Until now only the latest status WORD was kept, so a disbursed referral told us nothing else
-- (no time of each step, and no way to see whether Yubi sends an amount or a lender).
-- Additive and safe to run twice.
ALTER TABLE "PartnerReferral" ADD COLUMN IF NOT EXISTS "rawStatus" JSONB;
ALTER TABLE "PartnerReferral" ADD COLUMN IF NOT EXISTS "statusHistory" JSONB;
