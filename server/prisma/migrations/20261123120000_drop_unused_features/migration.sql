-- Removes four features nobody used (checked on production, 2026-11-23: 0 referrals, 0 campaigns,
-- 0 pre-approved plans, 0 calls linked to a campaign):
--   * friend referrals      -> "ReferralCode", "FriendReferral"
--   * outbound campaigns    -> "Campaign", "CampaignContact", "CallAttempt"."campaignId", four enums
--   * pre-approved plans    -> "PreApprovedPlan" (the MarketLoanOffer catalog)
-- Install links (/dl, "AppClick", "AppDownload") and the stuck-step rules ("StallRule") are NOT touched.
-- DESTRUCTIVE (drops tables) but idempotent. Deploy together with the code that no longer reads them.
-- Apply with `prisma migrate deploy`.

-- Friend referrals
DROP TABLE IF EXISTS "FriendReferral";
DROP TABLE IF EXISTS "ReferralCode";
DELETE FROM "PlatformSetting" WHERE "key" = 'referral.eligibleDays';

-- Campaigns: the call column that pointed at a campaign goes first, then the tables, then their enums.
ALTER TABLE "CallAttempt" DROP CONSTRAINT IF EXISTS "CallAttempt_campaignId_fkey";
DROP INDEX IF EXISTS "CallAttempt_campaignId_status_idx";
ALTER TABLE "CallAttempt" DROP COLUMN IF EXISTS "campaignId";
DROP TABLE IF EXISTS "CampaignContact";
DROP TABLE IF EXISTS "Campaign";
DROP TYPE IF EXISTS "ContactState";
DROP TYPE IF EXISTS "CampaignStatus";
DROP TYPE IF EXISTS "CampaignScheduleType";
DROP TYPE IF EXISTS "RetryStrategy";
-- The Ello settings that only the batch-campaign dialler read, and the campaign agent role.
UPDATE "IntegrationConfig"
   SET "settings" = "settings" - 'campaignPath' - 'campaignWebhookEvents'
 WHERE "provider" = 'ello' AND ("settings" ? 'campaignPath' OR "settings" ? 'campaignWebhookEvents');

-- Pre-approved plans (the "Available offers" catalog the app no longer shows)
DROP TABLE IF EXISTS "PreApprovedPlan";
